import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { getRole, getTeamEmails, canEditNote, canDeleteNote } from "@/lib/roles";
import { parseMentions } from "@/lib/mentions";
import {
  isNoteCategory,
  isNoteVisibility,
  normalizeTags,
  normalizeLinks,
  MAX_BODY_LEN,
} from "@/lib/noteTypes";

export const dynamic = "force-dynamic";

type RouteCtx = { params: { id: string } };

async function loadNote(id: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stock_notes")
    .select("id, author_email, body, category, tags, visibility, pinned, deleted_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as
    | {
        id: number;
        author_email: string;
        body: string;
        category: string;
        tags: string[];
        visibility: string;
        pinned: boolean;
        deleted_at: string | null;
        updated_at: string;
      }
    | null;
}

/**
 * PATCH /api/notes/:id — edit a note. Allowed for the author or a VP/CIO.
 * Optimistic concurrency: client may send `updated_at` (the version it loaded);
 * a mismatch returns 409. Writes a note_edits audit row after a successful update.
 */
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
    const note = await loadNote(id);
    if (!note || note.deleted_at) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const role = await getRole(email);
    if (!canEditNote(role, note.author_email, email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const reqBody = await req.json();
    const expectedUpdatedAt: string | undefined =
      typeof reqBody?.updated_at === "string" ? reqBody.updated_at : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { edited: true, updated_at: new Date().toISOString() };

    let bodyChanged = false;
    let visibilityChanged = false;

    if (reqBody?.body !== undefined) {
      const text = typeof reqBody.body === "string" ? reqBody.body.trim() : "";
      if (!text) return NextResponse.json({ error: "Note body is required" }, { status: 400 });
      if (text.length > MAX_BODY_LEN) {
        return NextResponse.json({ error: `Note too long (max ${MAX_BODY_LEN})` }, { status: 400 });
      }
      patch.body = text;
      bodyChanged = true;
    }
    if (reqBody?.category !== undefined) {
      if (!isNoteCategory(reqBody.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      patch.category = reqBody.category;
    }
    if (reqBody?.visibility !== undefined) {
      if (!isNoteVisibility(reqBody.visibility)) {
        return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
      }
      patch.visibility = reqBody.visibility;
      visibilityChanged = true;
    }
    if (reqBody?.tags !== undefined) patch.tags = normalizeTags(reqBody.tags);
    if (reqBody?.pinned !== undefined) patch.pinned = reqBody.pinned === true;
    if (reqBody?.links !== undefined) patch.links = normalizeLinks(reqBody.links);

    // Re-derive mentions when the body, visibility, or share list could change, and
    // re-enforce the private-note rule (no @mentions in a private note). An explicit
    // share-with list forces the note to "shared".
    const shareWithProvided = reqBody?.share_with !== undefined;
    let mentions: string[] | undefined;
    if (bodyChanged || visibilityChanged || shareWithProvided) {
      const teamEmails = await getTeamEmails();
      teamEmails.add(email);
      const effectiveBody = bodyChanged ? patch.body : note.body;
      const shareMentions = (Array.isArray(reqBody?.share_with) ? reqBody.share_with : [])
        .filter((e: unknown): e is string => typeof e === "string")
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => teamEmails.has(e) && e !== email);
      let effectiveVisibility = visibilityChanged ? patch.visibility : note.visibility;
      if (shareMentions.length > 0) {
        effectiveVisibility = "shared";
        patch.visibility = "shared";
      }
      const bodyMentions = parseMentions(effectiveBody, teamEmails);
      if (effectiveVisibility === "private" && bodyMentions.length > 0) {
        return NextResponse.json(
          { error: "Private notes can't @mention teammates." },
          { status: 400 }
        );
      }
      mentions =
        effectiveVisibility === "private"
          ? []
          : Array.from(new Set([...bodyMentions, ...shareMentions]));
      patch.mentions = mentions;
    }

    // Concurrency-guarded update FIRST; only audit on success.
    let upd = supabase.from("stock_notes").update(patch).eq("id", id).is("deleted_at", null);
    if (expectedUpdatedAt) upd = upd.eq("updated_at", expectedUpdatedAt);
    const { data: updated, error: updErr } = await upd
      .select("id, updated_at")
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      return NextResponse.json(
        { error: "Conflict: this note changed since you loaded it. Refresh and retry." },
        { status: 409 }
      );
    }

    await supabase.from("note_edits").insert({
      note_id: id,
      editor_email: email,
      action: "edit",
      prev_body: note.body,
      prev_category: note.category,
      prev_tags: note.tags,
      prev_visibility: note.visibility,
    });

    return NextResponse.json({ ok: true, id, edited: true, updated_at: updated.updated_at, mentions });
  } catch (error: unknown) {
    console.error("[/api/notes/:id PATCH]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/:id — soft delete. Allowed for the author or a VP/CIO.
 */
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
    const note = await loadNote(id);
    if (!note || note.deleted_at) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const role = await getRole(email);
    if (!canDeleteNote(role, note.author_email, email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from("stock_notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (delErr) throw delErr;

    await supabase.from("note_edits").insert({
      note_id: id,
      editor_email: email,
      action: "delete",
      prev_body: note.body,
      prev_category: note.category,
      prev_tags: note.tags,
      prev_visibility: note.visibility,
    });

    return NextResponse.json({ ok: true, id, deleted: true });
  } catch (error: unknown) {
    console.error("[/api/notes/:id DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
