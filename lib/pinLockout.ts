import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

// Holdings-PIN brute-force lockout (H3). Backed by the `pin_attempts` table
// (migrations/007_pin_attempts.sql), keyed by authenticated user email.
//
// Design notes:
// - FAIL-OPEN on any infra error (Supabase unconfigured / table missing / query throws):
//   lockout is defense-in-depth on top of the constant-time PIN compare, which always
//   gates access. A missing migration must never lock the whole team out.
// - Lockout begins only AFTER the threshold is crossed, then backs off exponentially.

const MAX_FAILS_BEFORE_LOCK = 5;
// Backoff applied once fail_count >= threshold: 30s, 1m, 5m, 15m, 1h (then capped).
const LOCK_SCHEDULE_SEC = [30, 60, 300, 900, 3600];

export interface LockoutStatus {
  locked: boolean;
  retryAfterSec?: number;
}

/** Returns current lockout status for a user. Fail-open. */
export async function checkPinLockout(email: string): Promise<LockoutStatus> {
  if (!email || !isSupabaseConfigured()) return { locked: false };
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("pin_attempts")
      .select("locked_until")
      .eq("user_email", email)
      .single();
    if (error || !data?.locked_until) return { locked: false };
    const untilMs = new Date(data.locked_until as string).getTime();
    const remaining = untilMs - Date.now();
    if (remaining > 0) return { locked: true, retryAfterSec: Math.ceil(remaining / 1000) };
    return { locked: false };
  } catch {
    return { locked: false };
  }
}

/** Records a failed PIN attempt and returns the resulting lockout status. Fail-open. */
export async function recordPinFailure(email: string): Promise<LockoutStatus> {
  if (!email || !isSupabaseConfigured()) return { locked: false };
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("pin_attempts")
      .select("fail_count")
      .eq("user_email", email)
      .single();
    const failCount = ((data?.fail_count as number) ?? 0) + 1;

    let lockedUntil: string | null = null;
    let retryAfterSec: number | undefined;
    if (failCount >= MAX_FAILS_BEFORE_LOCK) {
      const idx = Math.min(failCount - MAX_FAILS_BEFORE_LOCK, LOCK_SCHEDULE_SEC.length - 1);
      retryAfterSec = LOCK_SCHEDULE_SEC[idx];
      lockedUntil = new Date(Date.now() + retryAfterSec * 1000).toISOString();
    }

    await supabase.from("pin_attempts").upsert({
      user_email: email,
      fail_count: failCount,
      locked_until: lockedUntil,
      last_attempt: new Date().toISOString(),
    });

    return lockedUntil ? { locked: true, retryAfterSec } : { locked: false };
  } catch {
    return { locked: false };
  }
}

/** Clears the failure counter on a successful unlock. Non-fatal on error. */
export async function clearPinFailures(email: string): Promise<void> {
  if (!email || !isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    await supabase.from("pin_attempts").delete().eq("user_email", email);
  } catch {
    /* non-fatal */
  }
}
