// Shared types + pure helpers for the stock-notes feature.
// Imported by API routes (server) and NotesTab/DashboardClient (client) — keep it
// free of server-only imports so it is safe on both sides.

export type NoteCategory =
  | "meeting"
  | "discussion"
  | "update"
  | "thesis"
  | "risk"
  | "question";

export type NoteVisibility = "shared" | "private";

export const NOTE_CATEGORIES: NoteCategory[] = [
  "meeting",
  "discussion",
  "update",
  "thesis",
  "risk",
  "question",
];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  meeting: "Meeting",
  discussion: "Discussion",
  update: "Update",
  thesis: "Thesis",
  risk: "Risk",
  question: "Question",
};

export interface Note {
  id: number;
  stock_key: string;
  original_tikr: string;
  stock_name: string | null;
  author_email: string;
  category: NoteCategory;
  body: string;
  tags: string[];
  visibility: NoteVisibility;
  pinned: boolean;
  mentions: string[];
  edited: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const MAX_BODY_LEN = 5000;
export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 40;

// Stable join key for a stock. The sync pipeline re-cases / aliases / dedupes tikrs,
// so we anchor notes & follows to UPPER(trim(tikr)) rather than the raw string.
export function toStockKey(tikr: string): string {
  return String(tikr).trim().toUpperCase();
}

export function isNoteCategory(v: unknown): v is NoteCategory {
  return typeof v === "string" && (NOTE_CATEGORIES as string[]).includes(v);
}

export function isNoteVisibility(v: unknown): v is NoteVisibility {
  return v === "shared" || v === "private";
}

// Permissive enough for real tikrs in the universe, which include exchange prefixes,
// spaces, colons and parentheses (e.g. "XBOM:516003",
// "VIRTUOSO OPTOELECTRONICS LIMITED (XBOM:543597)"). Bounded length; no control chars.
const TIKR_RE = /^[A-Za-z0-9 .:()&_-]{1,120}$/;
export function isValidTikr(tikr: unknown): tikr is string {
  return typeof tikr === "string" && TIKR_RE.test(tikr.trim()) && tikr.trim().length > 0;
}

// Tag normalization: trim, lowercase, collapse whitespace, dedupe, cap count + length.
// Prevents the "Banking" / "banking" / "BANKING " tag explosion.
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (norm && norm.length <= MAX_TAG_LEN) out.add(norm);
    if (out.size >= MAX_TAGS) break;
  }
  return Array.from(out);
}
