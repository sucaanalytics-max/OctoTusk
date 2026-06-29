import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { isValidTikr } from "@/lib/noteTypes";
import { getRole, getTeamEmails } from "@/lib/roles";
import { parseMentions } from "@/lib/mentions";
import { sendPushToUsers, isWebPushConfigured } from "@/lib/webpush";
import {
  isChatScope,
  chatScopeKey,
  chatAuthorName,
  MAX_CHAT_LEN,
  MAX_CHAT_MENTIONS,
  type ChatScope,
} from "@/lib/chat";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id, scope, scope_key, author_email, body, mentions, stock_name, edited, created_at, updated_at";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

/**
 * GET /api/chat?scope=global | ?scope=stock&tikr=XYZ
 * Team-visible read (any authed user). `?after=<iso>` returns only newer messages (poll delta).
 * Returns the caller's `role` so the client can show edit/delete affordances.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ messages: [], role: "analyst", dbConfigured: false });
  }

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope");
  if (!isChatScope(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  const tikr = sp.get("tikr");
  if (scope === "stock" && !isValidTikr(tikr)) {
    return NextResponse.json({ error: "Invalid or missing tikr" }, { status: 400 });
  }
  const scopeKey = chatScopeKey(scope as ChatScope, tikr);
  if (!scopeKey) return NextResponse.json({ error: "Invalid scope key" }, { status: 400 });

  const after = sp.get("after");
  const limParam = Number(sp.get("limit"));
  const limit = Number.isFinite(limParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limParam)))
    : DEFAULT_LIMIT;

  try {
    const supabase = getSupabase();
    let q = supabase
      .from("chat_messages")
      .select(COLUMNS)
      .eq("scope", scope)
      .eq("scope_key", scopeKey)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (after && !Number.isNaN(Date.parse(after))) q = q.gt("created_at", after);
    const { data, error } = await q;
    if (error) throw error;

    const role = await getRole(email);
    return NextResponse.json({ messages: data || [], role, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/chat GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ messages: [], error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/chat — send a message. author_email is server-set (never trusted from the body).
 * Mentions resolve against the team allowlist (capped), each mentioned teammate (except the
 * author) gets a notification row + a web push that carries NO message text.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const reqBody = await req.json();
    const scope = reqBody?.scope;
    if (!isChatScope(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    const tikr = scope === "stock" ? reqBody?.tikr : null;
    if (scope === "stock" && !isValidTikr(tikr)) {
      return NextResponse.json({ error: "Invalid or missing tikr" }, { status: 400 });
    }
    const scopeKey = chatScopeKey(scope as ChatScope, tikr);
    if (!scopeKey) return NextResponse.json({ error: "Invalid scope key" }, { status: 400 });

    const text = typeof reqBody?.body === "string" ? reqBody.body.trim() : "";
    if (!text) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (text.length > MAX_CHAT_LEN) {
      return NextResponse.json({ error: `Message too long (max ${MAX_CHAT_LEN})` }, { status: 400 });
    }
    const stockName =
      typeof reqBody?.stock_name === "string" ? reqBody.stock_name.slice(0, 200) : null;

    // Resolve @mentions against the team allowlist; exclude self; cap fan-out.
    const teamEmails = await getTeamEmails();
    const mentions = parseMentions(text, teamEmails)
      .filter((e) => e !== email)
      .slice(0, MAX_CHAT_MENTIONS);

    const supabase = getSupabase();
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({
        scope,
        scope_key: scopeKey,
        author_email: email,
        body: text,
        mentions,
        stock_name: stockName,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    // Persist-then-push per mentioned teammate. Notification body + push carry NO message text
    // (a thread may hold holdings-adjacent text) — only "who mentioned you, where" + a deep link.
    if (mentions.length > 0) {
      const author = chatAuthorName(email);
      const url = scope === "stock" ? `/m/stock/${encodeURIComponent(String(tikr))}` : "/m/chat";
      const where = scope === "stock" ? `in ${stockName || tikr}` : "in the team channel";
      const rows = mentions.map((m) => ({
        user_email: m,
        kind: "chat_mention",
        title: `${author} mentioned you`,
        body: where,
        url,
        stock_key: scope === "stock" ? scopeKey : null,
        ref_id: msg.id,
      }));
      const { error: notifErr } = await supabase.from("notifications").insert(rows);
      if (notifErr) console.error("[/api/chat POST] notification insert failed", msg.id, notifErr.message);

      if (isWebPushConfigured()) {
        await sendPushToUsers(mentions, {
          title: `${author} mentioned you`,
          body: where,
          url,
          tag: `chat-mention-${msg.id}`,
        });
      }
    }

    return NextResponse.json({ ok: true, id: msg.id, created_at: msg.created_at, mentions });
  } catch (error: unknown) {
    console.error("[/api/chat POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
