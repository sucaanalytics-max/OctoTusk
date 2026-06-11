/**
 * Stock headlines via Google News RSS — free, keyless, India-localized.
 * Used by the Telegram /s card (top 3, ≤7 days) and /n command (8, ≤30 days).
 *
 * Resilient by contract: any failure (timeout, non-200, parse) returns []
 * so callers degrade gracefully instead of blocking the reply.
 */

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  ageLabel: string; // "2h", "3d"
};

const FETCH_TIMEOUT_MS = 3000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function ageLabel(date: Date, now: Date): string {
  const mins = Math.max(1, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export async function fetchNews(
  companyName: string,
  opts: { limit: number; maxAgeDays: number }
): Promise<NewsItem[]> {
  const query = encodeURIComponent(`"${companyName}" stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  let xml: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const now = new Date();
  const maxAgeMs = opts.maxAgeDays * 24 * 60 * 60 * 1000;
  const items: NewsItem[] = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const rawTitle = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
    if (!rawTitle || !link) continue;

    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime()) || now.getTime() - published.getTime() > maxAgeMs) continue;

    // Google appends the source: "Headline - Publisher"
    const title = decodeEntities(rawTitle).trim();
    const sep = title.lastIndexOf(" - ");
    const headline = sep > 0 ? title.slice(0, sep).trim() : title;
    const publisher = sep > 0 ? title.slice(sep + 3).trim() : "";

    items.push({ title: headline, publisher, link, ageLabel: ageLabel(published, now) });
    if (items.length >= opts.limit) break;
  }

  return items;
}
