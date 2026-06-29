"use client";
// In-memory chat hook. No localStorage/session/IndexedDB — message bodies are team-visible but
// security-sensitive (may reference holdings-adjacent context). Mirrors useStockNotes pattern.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatScope } from "@/lib/chat";

const POLL_INTERVAL_MS = 10_000;

export interface UseChatResult {
  messages: ChatMessage[];
  role: "analyst" | "vp" | "cio";
  loading: boolean;
  error: string | null;
  send: (body: string) => Promise<string | null>;
  edit: (id: number, body: string) => Promise<string | null>;
  remove: (id: number) => Promise<string | null>;
}

function buildUrl(scope: ChatScope, tikr?: string, after?: string): string {
  const p = new URLSearchParams({ scope });
  if (scope === "stock" && tikr) p.set("tikr", tikr);
  if (after) p.set("after", after);
  return `/api/chat?${p.toString()}`;
}

export function useChat(scope: ChatScope, tikr?: string, stockName?: string): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [role, setRole] = useState<"analyst" | "vp" | "cio">("analyst");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the created_at of the newest known message for delta polling.
  const lastCreatedAt = useRef<string | undefined>(undefined);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // cancelledRef: set true in cleanup so any in-flight async path (fetch, setTimeout callback)
  // bails out before calling setState or re-arming the timer. Prevents setState-after-unmount
  // and the timer leak that re-arms after the cleanup has already fired (React 18 StrictMode).
  const cancelledRef = useRef(false);

  const fetchMessages = useCallback(
    async (delta: boolean, cancelled: { current: boolean }) => {
      try {
        const url = buildUrl(scope, tikr, delta ? lastCreatedAt.current : undefined);
        const res = await fetch(url, { cache: "no-store" });
        // Bail out if unmounted/scope-changed while the fetch was in-flight.
        if (cancelled.current) return;
        if (!res.ok) throw new Error(`chat ${res.status}`);
        const data = await res.json();
        if (cancelled.current) return;
        const incoming: ChatMessage[] = data.messages || [];
        if (data.role) setRole(data.role as "analyst" | "vp" | "cio");

        setMessages((prev) => {
          if (!delta) {
            if (incoming.length > 0) {
              lastCreatedAt.current = incoming[incoming.length - 1].created_at;
            }
            return incoming;
          }
          if (incoming.length === 0) return prev;
          const map = new Map<number, ChatMessage>();
          for (const m of prev) map.set(m.id, m);
          for (const m of incoming) map.set(m.id, m);
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          lastCreatedAt.current = merged[merged.length - 1].created_at;
          return merged;
        });
        if (!cancelled.current) setError(null);
      } catch {
        if (!cancelled.current && !delta) setError("Couldn't load messages.");
      } finally {
        if (!cancelled.current && !delta) setLoading(false);
      }
    },
    // scope + tikr changes trigger a new effect which resets cancelledRef; stockName is stable
    // within a render but doesn't affect fetch URLs, so not a dep here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, tikr],
  );

  // Initial load + poll setup.
  useEffect(() => {
    // Each effect invocation gets its own cancelled sentinel. The ref is shared with the
    // poll callback closure below so the cleanup can stop both the initial fetch and any
    // subsequent timer callbacks without needing to track them separately.
    cancelledRef.current = false;
    const cancelled = cancelledRef; // stable ref; the cleanup sets .current = true

    setLoading(true);
    setMessages([]);
    lastCreatedAt.current = undefined;

    // Recursive poll: arms itself after each delta fetch, guarded by cancelled.
    function schedulePoll() {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(async () => {
        if (cancelled.current) return; // already unmounted
        await fetchMessages(true, cancelled);
        if (!cancelled.current) schedulePoll(); // re-arm only if still mounted
      }, POLL_INTERVAL_MS);
    }

    fetchMessages(false, cancelled).then(() => {
      if (!cancelled.current) schedulePoll();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled.current) {
        fetchMessages(true, cancelled);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled.current = true; // stop all in-flight setState + re-arm
      document.removeEventListener("visibilitychange", onVisible);
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [fetchMessages]);

  const send = useCallback(
    async (body: string): Promise<string | null> => {
      const tempId = -(Date.now());
      const now = new Date().toISOString();
      const tempMsg: ChatMessage = {
        id: tempId,
        scope,
        scope_key: "",
        author_email: "__optimistic__",
        body,
        mentions: [],
        stock_name: null,
        edited: false,
        created_at: now,
        updated_at: now,
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const payload: Record<string, string> = { scope, body };
        if (scope === "stock" && tikr) {
          payload.tikr = tikr;
          // Include stock_name so chat_messages.stock_name is set and mention notifications
          // read "in <stockName>" rather than "in <tikr>".
          if (stockName) payload.stock_name = stockName;
        }
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return (d.error as string | undefined) ?? "Send failed.";
        }
        // Delta-fetch to replace temp with the real row.
        await fetchMessages(true, cancelledRef);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return null;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return "Send failed.";
      }
    },
    [scope, tikr, stockName, fetchMessages],
  );

  const edit = useCallback(
    async (id: number, body: string): Promise<string | null> => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, body, edited: true, updated_at: new Date().toISOString() } : m,
        ),
      );
      try {
        const res = await fetch(`/api/chat/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          await fetchMessages(true, cancelledRef);
          return (d.error as string | undefined) ?? "Edit failed.";
        }
        return null;
      } catch {
        await fetchMessages(true, cancelledRef);
        return "Edit failed.";
      }
    },
    [fetchMessages],
  );

  const remove = useCallback(
    async (id: number): Promise<string | null> => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      try {
        const res = await fetch(`/api/chat/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          await fetchMessages(true, cancelledRef);
          return (d.error as string | undefined) ?? "Delete failed.";
        }
        return null;
      } catch {
        await fetchMessages(true, cancelledRef);
        return "Delete failed.";
      }
    },
    [fetchMessages],
  );

  return { messages, role, loading, error, send, edit, remove };
}
