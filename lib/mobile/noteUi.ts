// Shared note-UI helpers (single source of truth; don't fork in components).

/** Display hostname for a link chip: strips protocol + www., falls back to the raw URL. */
export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
