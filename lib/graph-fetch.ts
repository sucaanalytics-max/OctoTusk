/**
 * Shared, hardened HTTP fetch for Microsoft Graph calls.
 *
 * Used by both the cron sync (scripts/sync-to-supabase.ts) and the manual
 * "Sync Data" route (app/api/sync/route.ts) so the two paths share one,
 * well-tested retry/timeout policy.
 *
 * Policy (see plan "Airtight OneDrive → Supabase Sync"):
 *  - Per-attempt timeout via AbortSignal.timeout, composed with an optional
 *    run-deadline signal via AbortSignal.any so no fetch ever runs past the
 *    overall run deadline.
 *  - A deadline abort is tagged (DeadlineError) and re-thrown immediately —
 *    NEVER retried and NEVER silently misread as a per-request timeout. The
 *    caller must not start a fallback fetch once the deadline has fired.
 *  - Status-aware retry: 429/503 honour Retry-After (integer-seconds OR
 *    HTTP-date), capped; 504 (server-side MaxRequestDurationExceeded) returns
 *    immediately so the caller can fall back (retrying a heavy workbook is
 *    futile); other thrown network errors back off with jitter and retry.
 *  - Jittered backoff avoids synchronised retry storms across the worker pool.
 *
 * AbortSignal.any / AbortSignal.timeout require Node ≥ 20.3 (the GitHub Action
 * runs Node 20; Vercel runs Node ≥ 20). Both are typed by TS 5.9 lib.dom.
 */

/** Thrown when the overall run deadline fires. Terminal — never retried. */
export class DeadlineError extends Error {
  constructor(message = "run deadline reached") {
    super(message);
    this.name = "DeadlineError";
  }
}

export function isDeadlineError(err: unknown): boolean {
  return err instanceof DeadlineError || (err instanceof Error && err.name === "DeadlineError");
}

export interface FetchRetryConfig {
  /** Per-attempt abort timeout in ms. */
  timeoutMs: number;
  /** Max attempts (default 3). Use 1 for heavy Graph calls that should fall back, not retry. */
  maxAttempts?: number;
  /** Optional overall run-deadline signal; once aborted, no new attempt starts. */
  deadlineSignal?: AbortSignal;
  /** Label for log lines (e.g. the file name). */
  label?: string;
}

const RETRY_STATUS = new Set([429, 503]);
const MAX_BACKOFF_MS = 30_000;

/** Parse a Retry-After header (integer seconds OR HTTP-date) into milliseconds. */
export function parseRetryAfter(headerVal: string | null): number {
  if (!headerVal) return 0;
  const trimmed = headerVal.trim();
  if (trimmed === "") return 0;
  const secs = Number(trimmed);
  if (!isNaN(secs)) return Math.max(0, secs * 1000);
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return 0;
}

function jitteredBackoff(attempt: number): number {
  return attempt * 2000 + Math.floor(Math.random() * 1000);
}

/** Sleep that rejects with DeadlineError if the deadline fires first. */
function sleep(ms: number, deadlineSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (deadlineSignal?.aborted) return reject(new DeadlineError());
    const timer = setTimeout(() => {
      deadlineSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DeadlineError());
    }
    deadlineSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Fetch with status/deadline-aware retry. Returns the Response (even when not
 * ok — the caller inspects res.status). Throws DeadlineError if the run
 * deadline fired, or the underlying network error after the last attempt.
 */
export async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  cfg: FetchRetryConfig,
): Promise<Response> {
  const { timeoutMs, maxAttempts = 3, deadlineSignal, label = "" } = cfg;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Never start a fetch once the run deadline has fired.
    if (deadlineSignal?.aborted) throw new DeadlineError();
    try {
      const signal = deadlineSignal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), deadlineSignal])
        : AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, { ...opts, signal });

      // Throttling / transient unavailability → honour Retry-After, back off, retry.
      if (RETRY_STATUS.has(res.status) && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
        const delay = Math.min(retryAfterMs || jitteredBackoff(attempt), MAX_BACKOFF_MS);
        console.warn(`[fetch] Retry ${attempt}/${maxAttempts}: ${label} (HTTP ${res.status}), waiting ${delay}ms`);
        await sleep(delay, deadlineSignal);
        continue;
      }
      // 504 and every other status: return as-is; the caller decides (e.g. fall back).
      return res;
    } catch (err) {
      // Deadline fired mid-flight (or during backoff) → terminal: never retry, never fall back.
      if (deadlineSignal?.aborted || isDeadlineError(err)) throw new DeadlineError();
      lastErr = err;
      if (attempt < maxAttempts) {
        const msg = err instanceof Error ? err.message : String(err);
        const delay = jitteredBackoff(attempt);
        console.warn(`[fetch] Retry ${attempt}/${maxAttempts}: ${label} (${msg}), waiting ${delay}ms`);
        await sleep(delay, deadlineSignal);
      } else {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: unreachable");
}
