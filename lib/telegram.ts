/**
 * Telegram Bot API sender for price alerts.
 *
 * Requires TELEGRAM_BOT_TOKEN (bot created via @BotFather) and
 * TELEGRAM_CHAT_ID (a DM or group chat id). Throws on failure so callers
 * can avoid persisting alert state when delivery didn't happen.
 */

// Telegram caps messages at 4096 VISIBLE chars (HTML tags/hrefs don't count).
const MAX_VISIBLE_CHARS = 4000;

function visibleLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").length;
}

/**
 * Trim oversized messages at LINE boundaries — naive slicing can cut inside
 * an <a href> (Google News links run ~500 chars) and Telegram then rejects
 * the whole message with "can't parse entities".
 */
function truncateHtmlSafe(text: string): string {
  if (visibleLength(text) <= MAX_VISIBLE_CHARS) return text;
  const lines = text.split("\n");
  while (lines.length > 1 && visibleLength(lines.join("\n")) > MAX_VISIBLE_CHARS - 20) {
    lines.pop();
  }
  let out = lines.join("\n");
  // Re-balance <pre> if truncation landed inside a multi-line block.
  const opens = (out.match(/<pre>/g) || []).length;
  const closes = (out.match(/<\/pre>/g) || []).length;
  if (opens > closes) out += "</pre>";
  return out + "\n…(truncated)";
}

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(
  text: string,
  opts?: { chatId?: string | number; replyTo?: number }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts?.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || chatId == null || chatId === "") {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
  }

  const body = truncateHtmlSafe(text);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: body,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts?.replyTo ? { reply_to_message_id: opts.replyTo, allow_sending_without_reply: true } : {}),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed ${res.status}: ${errText.slice(0, 200)}`);
  }
}
