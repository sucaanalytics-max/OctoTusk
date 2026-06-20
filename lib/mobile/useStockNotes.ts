"use client";
import { useCallback, useEffect, useState } from "react";
import type { Note, NoteCategory, NoteVisibility, NoteLink } from "@/lib/noteTypes";
import { toStockKey } from "@/lib/noteTypes";

// Notes data hook for a single stock. Structurally like useQuotes, but caches NOTHING:
// note bodies / mentions / links are sensitive (CLAUDE.md Security invariant) and must
// never touch localStorage. Always fetched fresh, re-fetched after each mutation.

export interface CreateNoteInput {
  tikr: string;
  stock_name?: string;
  category: NoteCategory;
  body: string;
  tags: string[];
  visibility: NoteVisibility;
  share_with: string[];
  links: NoteLink[];
}

export interface UseStockNotes {
  notes: Note[];
  loading: boolean;
  error: string | null;
  role: string;
  teamEmails: string[];
  refresh: () => Promise<void>;
  create: (input: CreateNoteInput) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
}

export function useStockNotes(tikr: string): UseStockNotes {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("analyst");
  const [teamEmails, setTeamEmails] = useState<string[]>([]);

  const stockKey = toStockKey(tikr);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?stock_key=${encodeURIComponent(stockKey)}&limit=200`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`notes ${res.status}`);
      const data = await res.json();
      setNotes((data.notes || []) as Note[]);
      if (data.role) setRole(String(data.role));
    } catch {
      setError("Couldn't load notes.");
    } finally {
      setLoading(false);
    }
  }, [stockKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Team allowlist for the "share with" picker (non-sensitive; fetch once).
  useEffect(() => {
    fetch("/api/notes/team", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { emails: [] }))
      .then((d) => setTeamEmails((d.emails || []) as string[]))
      .catch(() => {});
  }, []);

  const create = useCallback(
    async (input: CreateNoteInput) => {
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "Couldn't save note.");
          return false;
        }
      } catch {
        setError("Couldn't save note.");
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        if (!res.ok) return false;
      } catch {
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  return { notes, loading, error, role, teamEmails, refresh, create, remove };
}
