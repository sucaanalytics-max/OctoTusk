"use client";
// Composer shared by ChatThread (global + per-stock). @mention chip picker mirrors NoteComposer.
import { useEffect, useRef, useState } from "react";
import { MAX_CHAT_LEN } from "@/lib/chat";

interface Props {
  onSend: (body: string) => Promise<string | null>;
}

function initials(email: string): string {
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

function insertAtCursor(el: HTMLTextAreaElement, text: string): string {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  return el.value.slice(0, s) + text + el.value.slice(e);
}

export default function MessageComposer({ onSend }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [teamEmails, setTeamEmails] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch team email list once for @mention chips (non-sensitive: just email addresses).
  useEffect(() => {
    fetch("/api/notes/team", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setTeamEmails((d.emails || []) as string[]);
      })
      .catch(() => {
        /* non-critical — mention picker just won't show */
      });
  }, []);

  const handleChip = (email: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const mention = `@${email.split("@")[0]} `;
    const next = insertAtCursor(el, mention);
    setBody(next);
    // Restore focus so the user can keep typing.
    requestAnimationFrame(() => {
      el.focus();
      const pos = (el.selectionStart ?? 0) + mention.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setErr(null);
    const e = await onSend(trimmed);
    setSending(false);
    if (e) {
      setErr(e);
    } else {
      setBody("");
    }
  };

  const handleKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter sends.
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      handleSend();
    }
  };

  const remaining = MAX_CHAT_LEN - body.length;

  return (
    <div className="m-composer m-chatcomposer">
      {teamEmails.length > 0 && (
        <div className="m-composer-group">
          <span className="m-flabel">Mention</span>
          <div className="m-chipwrap">
            {teamEmails.map((e) => (
              <button
                key={e}
                type="button"
                className="m-chip"
                aria-label={`Mention ${e}`}
                title={e}
                onClick={() => handleChip(e)}
                disabled={sending}
              >
                {initials(e)}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="m-composer-body"
        rows={3}
        placeholder="Write a message… (Ctrl+Enter to send)"
        value={body}
        maxLength={MAX_CHAT_LEN}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKey}
        aria-label="Message text"
        disabled={sending}
      />

      {body.length > MAX_CHAT_LEN * 0.9 && (
        <p className="m-msg-charcount" aria-live="polite">
          {remaining} characters left
        </p>
      )}

      {err && (
        <p className="m-note-err" role="alert">
          {err}
        </p>
      )}

      <div className="m-composer-actions">
        <button
          type="button"
          className="m-composer-save"
          onClick={handleSend}
          disabled={sending || !body.trim()}
          aria-label="Send message"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
