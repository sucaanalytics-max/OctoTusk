"use client";
// Shared presentational thread for both the global channel and per-stock Discussion sections.
// Uses useChat for polling + mutations. Renders body as React text nodes (XSS-safe).
import { useState } from "react";
import type { ChatMessage, ChatScope } from "@/lib/chat";
import { chatAuthorName } from "@/lib/chat";
import { useChat } from "@/lib/mobile/useChat";
import { SkeletonRows } from "../components/Skeleton";
import MessageComposer from "../components/MessageComposer";

interface Props {
  scope: ChatScope;
  tikr?: string;
  stockName?: string;
  userEmail: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Highlight @mention tokens as React elements — no innerHTML, XSS-safe. */
function renderBody(text: string): React.ReactNode[] {
  // Split on @word tokens (letters, digits, dots, underscores, hyphens).
  const parts = text.split(/(@[\w.\-]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w.\-]+$/.test(part)) {
      return (
        <span key={i} className="m-mention">
          {part}
        </span>
      );
    }
    return part;
  });
}

interface MsgProps {
  msg: ChatMessage;
  isSelf: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onEdit: (id: number, body: string) => Promise<string | null>;
}

function MessageBubble({ msg, isSelf, canDelete, onDelete, onEdit }: MsgProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(msg.body);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submitEdit = async () => {
    if (!editBody.trim()) return;
    setSaving(true);
    setEditErr(null);
    const err = await onEdit(msg.id, editBody.trim());
    setSaving(false);
    if (err) {
      setEditErr(err);
    } else {
      setEditing(false);
    }
  };

  const isOptimistic = msg.id < 0;

  return (
    <div className={`m-msg${isSelf ? " m-msg-self" : ""}${isOptimistic ? " m-msg-pending" : ""}`}>
      <div className="m-msg-meta">
        <span className="m-msg-author">{chatAuthorName(msg.author_email)}</span>
        <span className="m-msg-time">{relTime(msg.created_at)}</span>
        {msg.edited && <span className="m-note-badge">edited</span>}
      </div>

      {editing ? (
        <div className="m-msg-editwrap">
          <textarea
            className="m-composer-body"
            rows={3}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            aria-label="Edit message"
            disabled={saving}
          />
          {editErr && (
            <p className="m-note-err" role="alert">
              {editErr}
            </p>
          )}
          <div className="m-composer-actions">
            <button
              type="button"
              className="m-chip"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="m-composer-save"
              onClick={submitEdit}
              disabled={saving || !editBody.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="m-msg-body">{renderBody(msg.body)}</p>
      )}

      {!editing && (isSelf || canDelete) && !isOptimistic && (
        <div className="m-msg-actions">
          {isSelf && (
            <button
              type="button"
              className="m-msg-edit"
              onClick={() => {
                setEditBody(msg.body);
                setEditing(true);
              }}
              aria-label="Edit message"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="m-msg-del"
              onClick={onDelete}
              aria-label="Delete message"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatThread({ scope, tikr, stockName, userEmail }: Props) {
  const { messages, role, loading, error, send, edit, remove } = useChat(scope, tikr, stockName);

  const canDelete = (authorEmail: string) =>
    authorEmail.toLowerCase() === userEmail.toLowerCase() ||
    role === "vp" ||
    role === "cio";

  const isSelf = (authorEmail: string) =>
    authorEmail.toLowerCase() === userEmail.toLowerCase() ||
    authorEmail === "__optimistic__";

  return (
    <div className="m-chatthread">
      {error && (
        <p className="m-note-err" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={3} />
      ) : messages.length === 0 ? (
        <p className="m-empty">No messages yet.</p>
      ) : (
        <div className="m-chatlist">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isSelf={isSelf(msg.author_email)}
              canDelete={canDelete(msg.author_email)}
              onDelete={() => remove(msg.id)}
              onEdit={edit}
            />
          ))}
        </div>
      )}

      <MessageComposer onSend={send} />
    </div>
  );
}
