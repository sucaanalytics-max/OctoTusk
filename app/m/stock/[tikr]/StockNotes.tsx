"use client";
import { useState } from "react";
import type { Note } from "@/lib/noteTypes";
import { NOTE_CATEGORY_LABELS, type NoteCategory } from "@/lib/noteTypes";
import { useStockNotes } from "@/lib/mobile/useStockNotes";
import NoteComposer from "./NoteComposer";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function NoteCard({ note, canDelete, onDelete }: { note: Note; canDelete: boolean; onDelete: () => void }) {
  return (
    <div className="m-note">
      <div className="m-note-top">
        <span className="m-note-cat">{NOTE_CATEGORY_LABELS[note.category as NoteCategory] ?? note.category}</span>
        {note.visibility === "private" && <span className="m-note-badge">Private</span>}
        {note.edited && <span className="m-note-badge">edited</span>}
        <span className="m-note-time">{relTime(note.created_at)}</span>
      </div>

      <p className="m-note-body">{note.body}</p>

      {note.tags?.length > 0 && (
        <div className="m-note-chips">
          {note.tags.map((t) => (
            <span key={t} className="m-note-tag">#{t}</span>
          ))}
        </div>
      )}

      {note.links && note.links.length > 0 && (
        <div className="m-note-chips">
          {note.links.map((l, i) => (
            <a
              key={`${l.url}-${i}`}
              className="m-attach-chip"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              🔗 {l.label || hostname(l.url)}
            </a>
          ))}
        </div>
      )}

      <div className="m-note-foot">
        <span className="m-note-author">{note.author_email.split("@")[0]}</span>
        {note.mentions?.length > 0 && (
          <span className="m-note-shared">· shared with {note.mentions.length}</span>
        )}
        {canDelete && (
          <button className="m-note-del" onClick={onDelete} aria-label="Delete note">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function StockNotes({
  tikr,
  stockName,
  userEmail,
}: {
  tikr: string;
  stockName: string;
  userEmail: string;
}) {
  const { notes, loading, error, role, teamEmails, create, remove } = useStockNotes(tikr);
  const [composing, setComposing] = useState(false);

  const canDelete = (authorEmail: string) =>
    authorEmail.toLowerCase() === userEmail.toLowerCase() || role === "vp" || role === "cio";

  return (
    <section className="m-section">
      <div className="m-note-head">
        <h2 className="m-section-title">Notes</h2>
        {!composing && (
          <button className="m-note-add" onClick={() => setComposing(true)}>
            + Add
          </button>
        )}
      </div>

      {composing && (
        <NoteComposer
          tikr={tikr}
          stockName={stockName}
          teamEmails={teamEmails}
          userEmail={userEmail}
          onCreate={create}
          onClose={() => setComposing(false)}
        />
      )}

      {error && <p className="m-note-err">{error}</p>}

      {loading ? (
        <p className="m-empty">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="m-empty">No notes yet. Add the first one.</p>
      ) : (
        <div className="m-notelist">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} canDelete={canDelete(n.author_email)} onDelete={() => remove(n.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
