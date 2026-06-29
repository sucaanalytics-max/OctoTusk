import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getRole, getTeamEmails, canEditNote, canDeleteNote } from "@/lib/roles";
import { parseMentions } from "@/lib/mentions";
import { MAX_CHAT_LEN, MAX_CHAT_MENTIONS } from "@/lib/chat";

export const dynamic = "force-dynamic";

type RouteCtx = { params: { id: string } };

async function loadMessage(id: number) {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    .select("id, author_email, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: number; author_email: string; deleted_at: string | null } | null;
}

/** PATCH /api/chat/:id — edit body. Author or VP/CIO only. Re-derives mentions but does NOT re-notify. */
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const msg = await loadMessage(id);
    if (!msg || msg.deleted_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getRole(email);
    // 404 (not 403) so a non-author can't probe message existence by id.
    if (!canEditNote(role, msg.author_email, email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reqJson = await req.json().catch(() => ({}));
    const text = typeof reqJson?.body === "string" ? reqJson.body.trim() : "";
    if (!text) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (text.length > MAX_CHAT_LEN) {
      return NextResponse.json({ error: `Message too long (max ${MAX_CHAT_LEN})` }, { status: 400 });
    }

    const teamEmails = await getTeamEmails();
    const mentions = parseMentions(text, teamEmails)
      .filter((e) => e !== email)
      .slice(0, MAX_CHAT_MENTIONS);

    const { data, error } = await supabase
      .from("chat_messages")
      .update({ body: text, mentions, edited: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id, edited: true, updated_at: data.updated_at });
  } catch (error: unknown) {
    console.error("[/api/chat/:id PATCH]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** DELETE /api/chat/:id — soft delete. Author or VP/CIO only. */
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const msg = await loadMessage(id);
    if (!msg || msg.deleted_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = await getRole(email);
    if (!canDeleteNote(role, msg.author_email, email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
    return NextResponse.json({ ok: true, id, deleted: true });
  } catch (error: unknown) {
    console.error("[/api/chat/:id DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
