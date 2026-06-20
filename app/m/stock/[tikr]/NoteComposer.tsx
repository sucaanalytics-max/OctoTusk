"use client";
import { useState } from "react";
import {
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  type NoteCategory,
  type NoteLink,
  isSafeHttpsUrl,
  MAX_LINKS,
} from "@/lib/noteTypes";
import type { CreateNoteInput } from "@/lib/mobile/useStockNotes";

interface Props {
  tikr: string;
  stockName: string;
  teamEmails: string[];
  userEmail: string;
  onCreate: (input: CreateNoteInput) => Promise<boolean>;
  onClose: () => void;
}

function initials(email: string): string {
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

export default function NoteComposer({ tikr, stockName, teamEmails, userEmail, onCreate, onClose }: Props) {
  const [category, setCategory] = useState<NoteCategory>("update");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [shareWith, setShareWith] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const others = teamEmails.filter((e) => e !== userEmail.toLowerCase());
  const sharing = shareWith.size > 0;

  const toggleShare = (e: string) =>
    setShareWith((p) => {
      const n = new Set(p);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });

  const addLink = () => {
    const url = linkUrl.trim();
    if (!isSafeHttpsUrl(url)) {
      setErr("Links must start with https://");
      return;
    }
    if (links.length >= MAX_LINKS) {
      setErr(`Up to ${MAX_LINKS} links.`);
      return;
    }
    setLinks((p) => [...p, linkLabel.trim() ? { url, label: linkLabel.trim() } : { url }]);
    setLinkUrl("");
    setLinkLabel("");
    setErr(null);
  };

  const submit = async () => {
    if (!body.trim()) {
      setErr("Note text is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const ok = await onCreate({
      tikr,
      stock_name: stockName,
      category,
      body: body.trim(),
      tags: tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
      visibility: sharing ? "shared" : isPrivate ? "private" : "shared",
      share_with: Array.from(shareWith),
      links,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="m-composer">
      <select
        className="m-composer-cat"
        value={category}
        onChange={(e) => setCategory(e.target.value as NoteCategory)}
        aria-label="Category"
      >
        {NOTE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {NOTE_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>

      <textarea
        className="m-composer-body"
        rows={3}
        placeholder="Write a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Note text"
      />

      <input
        className="m-composer-input"
        placeholder="Tags (comma separated)"
        value={tagsStr}
        onChange={(e) => setTagsStr(e.target.value)}
        aria-label="Tags"
      />

      {others.length > 0 && (
        <div className="m-composer-group">
          <span className="m-flabel">Share with</span>
          <div className="m-chipwrap">
            {others.map((e) => (
              <button
                key={e}
                type="button"
                className={`m-chip${shareWith.has(e) ? " is-active" : ""}`}
                aria-pressed={shareWith.has(e)}
                onClick={() => toggleShare(e)}
                title={e}
              >
                {initials(e)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="m-composer-group">
        <span className="m-flabel">Links</span>
        {links.length > 0 && (
          <div className="m-chipwrap">
            {links.map((l, i) => (
              <button
                key={`${l.url}-${i}`}
                type="button"
                className="m-chip is-active"
                onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}
              >
                🔗 {l.label || new URL(l.url).hostname} ✕
              </button>
            ))}
          </div>
        )}
        <div className="m-linkrow">
          <input
            className="m-composer-input"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            aria-label="Link URL"
          />
          <input
            className="m-composer-input m-linklabel"
            placeholder="Label (optional)"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            aria-label="Link label"
          />
          <button type="button" className="m-chip" onClick={addLink}>
            Add
          </button>
        </div>
      </div>

      <label className={`m-toggle${sharing ? " is-disabled" : ""}`}>
        <span>Private {sharing ? "(off — shared)" : ""}</span>
        <input
          type="checkbox"
          checked={isPrivate && !sharing}
          disabled={sharing}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
      </label>

      {err && <p className="m-note-err">{err}</p>}

      <div className="m-composer-actions">
        <button type="button" className="m-chip" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="m-composer-save" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}
