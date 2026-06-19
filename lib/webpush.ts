// Web Push sender. Mirrors lib/telegram.ts's shape but is BEST-EFFORT: it never throws,
// so a dead endpoint or misconfig can't break the alert engine or a note insert.
// Dead endpoints (HTTP 404/410) are pruned; other failures increment failed_count and
// are pruned after repeated failures.

import webpush from "web-push";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

let _vapidSet = false;

export function isWebPushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function ensureVapid() {
  if (_vapidSet) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  _vapidSet = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

const MAX_FAILURES = 5;

/**
 * Fan out a push to every device a user has registered. Returns counts; never throws.
 * Payloads must carry NO sensitive content (only who/which stock + a deep link).
 */
export async function sendPushToUser(
  email: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!isWebPushConfigured() || !isSupabaseConfigured()) return { sent: 0, pruned: 0 };

  try {
    ensureVapid();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_email", email.toLowerCase());
    if (error || !data || data.length === 0) return { sent: 0, pruned: 0 };

    const json = JSON.stringify(payload);
    let sent = 0;
    const deadIds: number[] = [];
    const failedIds: number[] = [];

    await Promise.allSettled(
      data.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            json
          );
          sent++;
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) deadIds.push(row.id);
          else failedIds.push(row.id);
        }
      })
    );

    let pruned = 0;
    if (deadIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", deadIds);
      pruned += deadIds.length;
    }
    // Bump failed_count; prune chronically-failing endpoints.
    for (const id of failedIds) {
      const { data: r } = await supabase
        .from("push_subscriptions")
        .select("failed_count")
        .eq("id", id)
        .maybeSingle();
      const fc = ((r?.failed_count as number) || 0) + 1;
      if (fc >= MAX_FAILURES) {
        await supabase.from("push_subscriptions").delete().eq("id", id);
        pruned++;
      } else {
        await supabase.from("push_subscriptions").update({ failed_count: fc }).eq("id", id);
      }
    }

    return { sent, pruned };
  } catch (err) {
    console.error("[webpush] sendPushToUser failed:", err instanceof Error ? err.message : err);
    return { sent: 0, pruned: 0 };
  }
}

/** Fan out the same payload to many users (deduped). Never throws. */
export async function sendPushToUsers(
  emails: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const unique = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  let sent = 0;
  let pruned = 0;
  await Promise.allSettled(
    unique.map(async (e) => {
      const r = await sendPushToUser(e, payload);
      sent += r.sent;
      pruned += r.pruned;
    })
  );
  return { sent, pruned };
}
