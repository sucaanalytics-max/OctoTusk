/**
 * Telegram Bot API sender for price alerts.
 *
 * Requires TELEGRAM_BOT_TOKEN (bot created via @BotFather) and
 * TELEGRAM_CHAT_ID (a DM or group chat id). Throws on failure so callers
 * can avoid persisting alert state when delivery didn't happen.
 */

// Telegram hard-caps messages at 4096 chars; stay under with headroom.
const MAX_MESSAGE_CHARS = 4000;

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

  let body = text;
  if (body.length > MAX_MESSAGE_CHARS) {
    body = body.slice(0, MAX_MESSAGE_CHARS) + "\n…(truncated)";
  }

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
