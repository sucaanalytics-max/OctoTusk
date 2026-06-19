"use client";

import { useMemo, useState } from "react";
import type { EnrichedStock } from "./DashboardClient";
import type { NewNoteInput } from "./NotesTab";
import type { Role } from "@/lib/roles";
import {
  type Note,
  type NoteCategory,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  toStockKey,
} from "@/lib/noteTypes";

interface StockNotesPanelProps {
  stock: EnrichedStock;
  notes: Note[];
  userEmail: string;
  role: Role;
  isFollowing: boolean;
  onCreate: (input: NewNoteInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggleFollow: (tikr: string, following: boolean) => void;
}

function authorShort(email: string): string {
  const local = email.split("@")[0] || email;
  return local.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// In-context notes for a single stock, shown in the detail panel.
export default function StockNotesPanel({
  stock,
  notes,
  userEmail,
  role,
  isFollowing,
  onCreate,
  onDelete,
  onToggleFollow,
}: StockNotesPanelProps) {
  const me = userEmail.toLowerCase();
  const isPrivileged = role === "vp" || role === "cio";
  const key = toStockKey(stock.tikr);

  const [category, setCategory] = useState<NoteCategory>("update");
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const stockNotes = useMemo(
    () => notes.filter((n) => n.stock_key === key),
    [notes, key]
  );

  const canSubmit = body.trim() && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onCreate({
        tikr: stock.tikr,
        stock_name: stock.companyShort,
        category,
        body: body.trim(),
        tags: [],
        visibility: isPrivate ? "private" : "shared",
      });
      setBody("");
      setIsPrivate(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="metric-card mb-4 animate-fade-in-up delay-4" style={{ borderTop: "2px solid var(--color-accent-blue)" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold uppercase tracking-wider" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Stock Notes <span className="pill" style={{ background: "var(--color-accent-blue)20", color: "var(--color-accent-blue)", marginLeft: 6 }}>{stockNotes.length}</span>
        </h3>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: "var(--text-xs)", color: isFollowing ? "var(--color-accent-blue)" : "var(--color-text-muted)" }}
          onClick={() => onToggleFollow(stock.tikr, !isFollowing)}
          title={isFollowing ? "Following — you'll be notified of new notes" : "Follow for new-note alerts"}
        >
          {isFollowing ? "★ Following" : "☆ Follow"}
        </button>
      </div>

      {/* Add */}
      <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
        <select className="select-dark" value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)} style={{ flex: "0 0 130px", fontSize: "var(--text-xs)", padding: "4px 8px" }}>
          {NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>)}
        </select>
        <input className="input-dark" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note about this stock…" style={{ flex: 1, fontSize: "var(--text-xs)", padding: "4px 8px" }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <label className="flex items-center gap-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private
        </label>
        <button disabled={!canSubmit} onClick={submit} className="btn btn-sm" style={{ background: "var(--color-accent-blue)", color: "#fff", fontSize: "var(--text-xs)", opacity: canSubmit ? 1 : 0.4 }}>{saving ? "…" : "Save"}</button>
      </div>

      {/* List */}
      {stockNotes.length > 0 ? (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {stockNotes.map((n) => {
            const canModify = n.author_email === me || isPrivileged;
            return (
              <div key={n.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--color-border)", fontSize: "var(--text-xs)" }}>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                  <span className="pill" style={{ fontSize: 9, background: "var(--color-bg-secondary)", color: "var(--color-text-muted)" }}>{NOTE_CATEGORY_LABELS[n.category]}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{authorShort(n.author_email)}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>·</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{new Date(n.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {n.visibility === "private" && <span style={{ color: "var(--color-text-muted)" }}>· 🔒</span>}
                  {canModify && (
                    <button onClick={() => { if (confirm("Delete this note?")) onDelete(n.id); }} className="ml-auto" style={{ background: "none", border: "none", color: "var(--color-negative)", cursor: "pointer", fontSize: 10 }}>Delete</button>
                  )}
                </div>
                <div style={{ color: "var(--color-text-secondary)", marginTop: 2, whiteSpace: "pre-wrap" }}>{n.body}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>No notes on this stock yet.</p>
      )}
    </div>
  );
}
