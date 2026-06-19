import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getRole, getTeamEmails } from "@/lib/roles";
import { applyVisibility } from "@/lib/notesAuth";
import { parseMentions } from "@/lib/mentions";
import { sendPushToUsers, isWebPushConfigured } from "@/lib/webpush";
import {
  isNoteCategory,
  isNoteVisibility,
  isValidTikr,
  normalizeTags,
  toStockKey,
  MAX_BODY_LEN,
} from "@/lib/noteTypes";

export const dynamic = "force-dynamic";

const NOTE_COLUMNS =
  "id, stock_key, original_tikr, stock_name, author_email, category, body, tags, visibility, pinned, mentions, edited, created_at, updated_at";

/**
 * GET /api/notes — list notes the caller is allowed to see.
 * Visibility (shared OR own-private) is enforced in SQL via applyVisibility — NOT here.
 * Filters: ?stock_key= ?category= ?author= ?q= ?limit=
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ notes: [], role: "analyst", dbConfigured: false });
  }

  try {
    const supabase = getSupabase();
    const sp = req.nextUrl.searchParams;
    const stockKey = sp.get("stock_key");
    const category = sp.get("category");
    const author = sp.get("author");
    const q = sp.get("q");
    const limit = Math.min(parseInt(sp.get("limit") || "200", 10) || 200, 500);

    let query = applyVisibility(
      supabase.from("stock_notes").select(NOTE_COLUMNS),
      email
    )
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (stockKey) query = query.eq("stock_key", toStockKey(stockKey));
    if (category && isNoteCategory(category)) query = query.eq("category", category);
    if (author) query = query.eq("author_email", author.toLowerCase());
    if (q) query = query.ilike("body", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    const role = await getRole(email);
    return NextResponse.json({ notes: data || [], role, dbConfigured: true });
  } catch (error: unknown) {
    console.error("[/api/notes GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ notes: [], error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/notes — create a note. Author is the authenticated user (server-set).
 * Private notes may NOT @mention teammates (would notify about a note they can't read).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const tikr = body?.tikr;
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    const category = body?.category;
    const visibility = isNoteVisibility(body?.visibility) ? body.visibility : "shared";

    if (!isValidTikr(tikr)) {
      return NextResponse.json({ error: "Invalid or missing tikr" }, { status: 400 });
    }
    if (!isNoteCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Note body is required" }, { status: 400 });
    }
    if (text.length > MAX_BODY_LEN) {
      return NextResponse.json({ error: `Note too long (max ${MAX_BODY_LEN})` }, { status: 400 });
    }

    // Resolve @mentions against the team allowlist (+ the author themself).
    const teamEmails = await getTeamEmails();
    teamEmails.add(email);
    const mentions = parseMentions(text, teamEmails);

    if (visibility === "private" && mentions.length > 0) {
      return NextResponse.json(
        { error: "Private notes can't @mention teammates. Make it Shared or remove the mention." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("stock_notes")
      .insert({
        stock_key: toStockKey(tikr),
        original_tikr: String(tikr).trim(),
        stock_name: typeof body?.stock_name === "string" ? body.stock_name.slice(0, 200) : null,
        author_email: email,
        category,
        body: text,
        tags: normalizeTags(body?.tags),
        visibility,
        pinned: body?.pinned === true,
        mentions,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    // Best-effort push fan-out for SHARED notes only (private notes notify no one).
    // The note is already committed with an id; sendPush* never throws, so this can
    // neither fail nor duplicate the note write. Payloads carry NO note body (privacy) —
    // just who/which stock + a deep link the recipient opens through the auth-gated app.
    if (visibility === "shared" && isWebPushConfigured()) {
      try {
        const noteId = data.id;
        const stockKey = toStockKey(tikr);
        const stockName = (typeof body?.stock_name === "string" && body.stock_name) || String(tikr).trim();
        const url = `/dashboard?stock=${encodeURIComponent(stockKey)}&note=${noteId}`;
        const authorName = email.split("@")[0].replace(/\./g, " ");

        const mentioned = mentions.filter((m) => m !== email);
        if (mentioned.length) {
          await sendPushToUsers(mentioned, {
            title: `${authorName} mentioned you`,
            body: `on ${stockName}`,
            url,
            tag: `note-mention-${noteId}`,
          });
        }

        const { data: followRows } = await supabase
          .from("stock_follows")
          .select("user_email")
          .eq("stock_key", stockKey);
        const followers = (followRows || [])
          .map((r) => String(r.user_email).toLowerCase())
          .filter((e) => e !== email && !mentioned.includes(e));
        if (followers.length) {
          await sendPushToUsers(followers, {
            title: `New note on ${stockName}`,
            body: `by ${authorName}`,
            url,
            tag: `note-${noteId}`,
          });
        }
      } catch (e) {
        console.error("[/api/notes POST] push fan-out (non-fatal):", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at, mentions });
  } catch (error: unknown) {
    console.error("[/api/notes POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}
