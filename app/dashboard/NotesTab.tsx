"use client";

import { useMemo, useState } from "react";
import type { EnrichedStock } from "./DashboardClient";
import type { Role } from "@/lib/roles";
import {
  type Note,
  type NoteCategory,
  type NoteVisibility,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  toStockKey,
} from "@/lib/noteTypes";

export interface NewNoteInput {
  tikr: string;
  stock_name?: string;
  category: NoteCategory;
  body: string;
  tags: string[];
  visibility: NoteVisibility;
  pinned?: boolean;
}

export interface EditNoteInput {
  body?: string;
  category?: NoteCategory;
  tags?: string[];
  visibility?: NoteVisibility;
  pinned?: boolean;
  updated_at?: string; // optimistic-concurrency token
}

interface NotesTabProps {
  notes: Note[];
  notesLoading: boolean;
  userEmail: string;
  role: Role;
  enrichedStocks: EnrichedStock[];
  onCreate: (input: NewNoteInput) => Promise<void>;
  onEdit: (id: number, patch: EditNoteInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onSelectStock: (s: EnrichedStock) => void;
  onRefresh: () => void;
}

const CATEGORY_STYLE: Record<NoteCategory, { bg: string; fg: string }> = {
  meeting: { bg: "#3B82F620", fg: "#3B82F6" },
  discussion: { bg: "#8B5CF620", fg: "#8B5CF6" },
  update: { bg: "#10B98120", fg: "#10B981" },
  thesis: { bg: "#F59E0B20", fg: "#F59E0B" },
  risk: { bg: "#EF444420", fg: "#EF4444" },
  question: { bg: "#6B728020", fg: "#6B7280" },
};

function authorShort(email: string): string {
  const local = email.split("@")[0] || email;
  return local.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tagsToString(tags: string[]): string {
  return tags.join(", ");
}
function stringToTags(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

// Render note body with @mentions highlighted. React escapes text nodes, so this is XSS-safe.
function renderBody(body: string, mentions: string[]): React.ReactNode {
  if (!mentions.length) return body;
  const parts = body.split(/(@[a-zA-Z0-9._%+-]+(?:@tuskinvest\.com)?)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const token = part.slice(1).toLowerCase();
      const candidate = token.includes("@") ? token : `${token}@tuskinvest.com`;
      if (mentions.includes(candidate)) {
        return (
          <span key={i} style={{ color: "var(--color-accent-blue)", fontWeight: 600 }}>
            {part}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function NotesTab({
  notes,
  notesLoading,
  userEmail,
  role,
  enrichedStocks,
  onCreate,
  onEdit,
  onDelete,
  onSelectStock,
  onRefresh,
}: NotesTabProps) {
  const me = userEmail.toLowerCase();
  const isPrivileged = role === "vp" || role === "cio";

  // Filters
  const [catFilter, setCatFilter] = useState<"all" | NoteCategory>("all");
  const [visFilter, setVisFilter] = useState<"all" | "shared" | "mine">("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formTikr, setFormTikr] = useState("");
  const [formCategory, setFormCategory] = useState<NoteCategory>("update");
  const [formBody, setFormBody] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formPrivate, setFormPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<NoteCategory>("update");
  const [editTags, setEditTags] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);

  // Resolve a stock_key -> live EnrichedStock (for display name + click-through)
  const stockByKey = useMemo(() => {
    const m = new Map<string, EnrichedStock>();
    enrichedStocks.forEach((s) => {
      if (s.tikr) m.set(toStockKey(s.tikr), s);
    });
    return m;
  }, [enrichedStocks]);

  const sortedStocks = useMemo(
    () =>
      enrichedStocks
        .filter((s) => s.tikr)
        .slice()
        .sort((a, b) => (a.companyShort || a.tikr).localeCompare(b.companyShort || b.tikr)),
    [enrichedStocks]
  );

  const authors = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => set.add(n.author_email));
    return Array.from(set).sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (catFilter !== "all" && n.category !== catFilter) return false;
      if (visFilter === "shared" && n.visibility !== "shared") return false;
      if (visFilter === "mine" && !(n.visibility === "private" && n.author_email === me)) return false;
      if (authorFilter !== "all" && n.author_email !== authorFilter) return false;
      if (q) {
        const stock = stockByKey.get(n.stock_key);
        const hay = `${n.body} ${n.stock_name || ""} ${stock?.companyShort || ""} ${n.author_email} ${n.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notes, catFilter, visFilter, authorFilter, search, me, stockByKey]);

  // Group by date (newest first; server already sorts pinned-first then created desc)
  const byDate = useMemo(() => {
    const groups: { date: string; items: Note[] }[] = [];
    const idx = new Map<string, Note[]>();
    filtered.forEach((n) => {
      const d = new Date(n.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      if (!idx.has(d)) {
        const arr: Note[] = [];
        idx.set(d, arr);
        groups.push({ date: d, items: arr });
      }
      idx.get(d)!.push(n);
    });
    return groups;
  }, [filtered]);

  const formStock = enrichedStocks.find((s) => s.tikr === formTikr);
  const canSubmit = formTikr && formBody.trim() && !saving;

  async function submitNew() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onCreate({
        tikr: formTikr,
        stock_name: formStock?.companyShort,
        category: formCategory,
        body: formBody.trim(),
        tags: stringToTags(formTags),
        visibility: formPrivate ? "private" : "shared",
      });
      setFormBody("");
      setFormTags("");
      setFormPrivate(false);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditBody(n.body);
    setEditCategory(n.category);
    setEditTags(tagsToString(n.tags));
    setEditPrivate(n.visibility === "private");
  }

  async function submitEdit(n: Note) {
    await onEdit(n.id, {
      body: editBody.trim(),
      category: editCategory,
      tags: stringToTags(editTags),
      visibility: editPrivate ? "private" : "shared",
      updated_at: n.updated_at,
    });
    setEditingId(null);
  }

  return (
    <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes">
      <div className="metric-card animate-fade-in-up" style={{ borderTop: "3px solid var(--color-accent-blue)" }}>
        {/* Header + filters */}
        <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3 className="font-bold" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
            Notes <span className="pill" style={{ background: "var(--color-accent-blue)20", color: "var(--color-accent-blue)", marginLeft: 8 }}>{filtered.length}</span>
          </h3>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <button className={`scatter-pill${catFilter === "all" ? " active" : ""}`} onClick={() => setCatFilter("all")}>All</button>
            {NOTE_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`scatter-pill${catFilter === c ? " active" : ""}`}
                onClick={() => setCatFilter(c)}
                style={catFilter === c ? { background: CATEGORY_STYLE[c].bg, color: CATEGORY_STYLE[c].fg, borderColor: CATEGORY_STYLE[c].fg } : {}}
              >
                {NOTE_CATEGORY_LABELS[c]}
              </button>
            ))}
            <button className="scatter-pill" onClick={() => { setShowForm((p) => !p); }} style={showForm ? { background: "var(--color-accent-blue)20", color: "var(--color-accent-blue)" } : {}}>+ Add Note</button>
            <button className="scatter-pill" onClick={onRefresh} style={{ fontSize: 10 }}>↻</button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
          {(["all", "shared", "mine"] as const).map((v) => (
            <button key={v} className={`scatter-pill${visFilter === v ? " active" : ""}`} onClick={() => setVisFilter(v)}>
              {v === "all" ? "All" : v === "shared" ? "Shared" : "My private"}
            </button>
          ))}
          <select className="select-dark" value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} style={{ fontSize: "var(--text-xs)", padding: "4px 8px" }}>
            <option value="all">All authors</option>
            {authors.map((a) => <option key={a} value={a}>{authorShort(a)}</option>)}
          </select>
          <input className="input-dark" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…" style={{ flex: "1 1 180px", fontSize: "var(--text-xs)", padding: "4px 8px" }} />
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{ padding: "12px 16px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-md)", marginBottom: 12, border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
              <select className="select-dark" value={formTikr} onChange={(e) => setFormTikr(e.target.value)} style={{ flex: "0 0 200px" }}>
                <option value="">Select stock…</option>
                {sortedStocks.map((s) => <option key={s.tikr} value={s.tikr}>{s.companyShort || s.tikr}</option>)}
              </select>
              <select className="select-dark" value={formCategory} onChange={(e) => setFormCategory(e.target.value as NoteCategory)} style={{ flex: "0 0 150px" }}>
                {NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>)}
              </select>
              <label className="flex items-center gap-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={formPrivate} onChange={(e) => setFormPrivate(e.target.checked)} /> Private
              </label>
            </div>
            <textarea className="input-dark" value={formBody} onChange={(e) => setFormBody(e.target.value)} placeholder="Meeting / discussion / update… use @name to mention a teammate (shared notes only)" rows={3} style={{ width: "100%", marginBottom: 8, resize: "vertical" }} />
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <input className="input-dark" value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="tags, comma, separated" style={{ flex: "1 1 200px", fontSize: "var(--text-xs)", padding: "4px 8px" }} />
              <button disabled={!canSubmit} onClick={submitNew} className="btn btn-primary btn-sm" style={{ opacity: canSubmit ? 1 : 0.4 }}>{saving ? "Saving…" : "Save Note"}</button>
            </div>
            {formPrivate && /@[a-zA-Z0-9._%+-]+/.test(formBody) && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-warning)", marginTop: 6 }}>Private notes can&apos;t @mention teammates — uncheck Private or remove the mention.</p>
            )}
          </div>
        )}

        {/* Timeline */}
        {notesLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Loading notes…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
            {notes.length === 0 ? "No notes yet. Add one above." : "No notes match these filters."}
          </div>
        ) : (
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {byDate.map(({ date, items }) => (
              <div key={date} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 600, padding: "4px 0", borderBottom: "1px solid var(--color-border)", marginBottom: 6 }}>{date}</div>
                {items.map((n) => {
                  const stock = stockByKey.get(n.stock_key);
                  const name = stock?.companyShort || n.stock_name || n.original_tikr;
                  const cat = CATEGORY_STYLE[n.category];
                  const canModify = n.author_email === me || isPrivileged;
                  const time = new Date(n.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

                  if (editingId === n.id) {
                    return (
                      <div key={n.id} style={{ padding: "10px 12px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-md)", marginBottom: 8, border: "1px solid var(--color-border)" }}>
                        <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
                          <select className="select-dark" value={editCategory} onChange={(e) => setEditCategory(e.target.value as NoteCategory)} style={{ flex: "0 0 150px" }}>
                            {NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>)}
                          </select>
                          <label className="flex items-center gap-1" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                            <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} /> Private
                          </label>
                        </div>
                        <textarea className="input-dark" value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} style={{ width: "100%", marginBottom: 8, resize: "vertical" }} />
                        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                          <input className="input-dark" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="tags, comma, separated" style={{ flex: "1 1 200px", fontSize: "var(--text-xs)", padding: "4px 8px" }} />
                          <button disabled={!editBody.trim()} onClick={() => submitEdit(n)} className="btn btn-primary btn-sm" style={{ opacity: editBody.trim() ? 1 : 0.4 }}>Save</button>
                          <button onClick={() => setEditingId(null)} className="btn btn-ghost btn-sm">Cancel</button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={n.id} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", marginBottom: 4 }} className="hover-highlight">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                          <span className="pill" style={{ background: cat.bg, color: cat.fg, fontSize: 10 }}>{NOTE_CATEGORY_LABELS[n.category]}</span>
                          <button
                            onClick={() => { if (stock) onSelectStock(stock); }}
                            className="font-semibold"
                            style={{ fontSize: "var(--text-sm)", color: stock ? "var(--color-accent-blue)" : "var(--color-text-primary)", background: "none", border: "none", padding: 0, cursor: stock ? "pointer" : "default" }}
                            title={stock ? "Open stock" : "Not in current universe"}
                          >
                            {name}
                          </button>
                          {!stock && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>(not in current universe)</span>}
                          {n.visibility === "private" && <span className="pill" style={{ background: "var(--color-bg-tertiary, #88888820)", color: "var(--color-text-muted)", fontSize: 10 }}>🔒 Private</span>}
                          {n.pinned && <span style={{ fontSize: 11 }} title="Pinned">📌</span>}
                        </div>
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {renderBody(n.body, n.mentions)}
                        </div>
                        {n.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1" style={{ flexWrap: "wrap" }}>
                            {n.tags.map((t) => <span key={t} className="pill" style={{ fontSize: 9, color: "var(--color-text-muted)", background: "var(--color-bg-secondary)" }}>#{t}</span>)}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 3 }}>
                          {authorShort(n.author_email)} · {time}{n.edited && <span> · edited</span>}
                        </div>
                      </div>
                      {canModify && (
                        <div className="flex items-start gap-1" style={{ flexShrink: 0 }}>
                          <button onClick={() => startEdit(n)} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "2px 6px" }}>Edit</button>
                          <button onClick={() => { if (confirm("Delete this note?")) onDelete(n.id); }} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "2px 6px", color: "var(--color-negative)" }}>Delete</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
