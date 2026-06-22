#!/usr/bin/env npx tsx
/**
 * Unit harness for the sync reliability + carry-forward logic.
 * No test framework in this repo — run directly:  npx tsx scripts/test-sync-reliability.ts
 * Exits 0 if all assertions pass, 1 otherwise. Importing the modules under test
 * does NOT run their main() (guarded by require.main === module).
 */
import assert from "node:assert";
import { fetchWithRetry, parseRetryAfter, DeadlineError } from "../lib/graph-fetch";
import {
  vfDedupKey,
  applyCarryForward,
  isFloorBreached,
  type PrevSnapshot,
} from "./sync-to-supabase";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Stub fetch helpers ──────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
function withFetch(impl: typeof globalThis.fetch, fn: () => Promise<void>) {
  return (async () => {
    globalThis.fetch = impl;
    try { await fn(); } finally { globalThis.fetch = realFetch; }
  })();
}
const resp = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? "{}" : "", { status, headers });

// ── Build a PrevSnapshot the same way readPrevSnapshot does ──────────────────
function buildPrev(stocks: Record<string, unknown>[]): PrevSnapshot {
  const stocksByTikr = new Map<string, Record<string, unknown>>();
  const sourceKeys = new Set<string>();
  for (const s of stocks) {
    const tikr = typeof s.tikr === "string" ? s.tikr : "";
    if (!tikr) continue;
    stocksByTikr.set(tikr.toLowerCase(), s);
    const k = vfDedupKey(String(s._vf_source || ""));
    if (k) sourceKeys.add(k);
  }
  return { stocksByTikr, sourceKeys, holdings: null, foPositions: null, count: stocks.length };
}

async function main() {
  console.log("parseRetryAfter:");
  await test("integer seconds → ms", () => assert.equal(parseRetryAfter("2"), 2000));
  await test("zero / empty / null → 0", () => {
    assert.equal(parseRetryAfter("0"), 0);
    assert.equal(parseRetryAfter(""), 0);
    assert.equal(parseRetryAfter(null), 0);
  });
  await test("future HTTP-date → > 0", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    assert.ok(parseRetryAfter(future) > 0);
  });
  await test("past HTTP-date → 0", () => {
    const past = new Date(Date.now() - 60000).toUTCString();
    assert.equal(parseRetryAfter(past), 0);
  });
  await test("garbage → 0", () => assert.equal(parseRetryAfter("soon"), 0));

  console.log("fetchWithRetry classification:");
  await test("504 returns immediately, calls fetch exactly once (no retry)", () => {
    let calls = 0;
    return withFetch(async () => { calls++; return resp(504); }, async () => {
      const r = await fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 3, label: "t" });
      assert.equal(r.status, 504);
      assert.equal(calls, 1);
    });
  });

  await test("429 with Retry-After retries then succeeds", () => {
    let calls = 0;
    return withFetch(async () => {
      calls++;
      return calls === 1 ? resp(429, { "retry-after": "1" }) : resp(200);
    }, async () => {
      const r = await fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 3, label: "t" });
      assert.equal(r.status, 200);
      assert.equal(calls, 2);
    });
  });

  await test("network error retries then succeeds", () => {
    let calls = 0;
    return withFetch(async () => {
      calls++;
      if (calls === 1) throw new TypeError("network down");
      return resp(200);
    }, async () => {
      const r = await fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 3, label: "t" });
      assert.equal(r.status, 200);
      assert.equal(calls, 2);
    });
  });

  await test("timeout with maxAttempts:1 throws (no fallback retry)", () => {
    let calls = 0;
    return withFetch(async () => {
      calls++;
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    }, async () => {
      await assert.rejects(
        fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 1, label: "t" }),
        /timeout/i,
      );
      assert.equal(calls, 1);
    });
  });

  await test("pre-aborted deadline throws DeadlineError, never calls fetch", () => {
    let calls = 0;
    const ctrl = new AbortController();
    ctrl.abort(new DeadlineError());
    return withFetch(async () => { calls++; return resp(200); }, async () => {
      await assert.rejects(
        fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 3, deadlineSignal: ctrl.signal, label: "t" }),
        (e: unknown) => e instanceof DeadlineError,
      );
      assert.equal(calls, 0);
    });
  });

  await test("deadline firing mid-flight surfaces as DeadlineError (not timeout)", () => {
    const ctrl = new AbortController();
    return withFetch(async () => {
      ctrl.abort(new DeadlineError());       // deadline fires during the request
      throw new Error("aborted");
    }, async () => {
      await assert.rejects(
        fetchWithRetry("x", {}, { timeoutMs: 1000, maxAttempts: 3, deadlineSignal: ctrl.signal, label: "t" }),
        (e: unknown) => e instanceof DeadlineError,
      );
    });
  });

  console.log("vfDedupKey symmetry:");
  await test("date prefix + vF suffix stripped", () => {
    assert.equal(vfDedupKey("20250809_NSE vF.xlsx"), "nse");
    assert.equal(vfDedupKey("20250722_Smartworks vF.xlsx"), "smartworks");
  });
  await test("same company, new date → same key (rename-stable)", () => {
    assert.equal(vfDedupKey("20250809_NSE vF.xlsx"), vfDedupKey("20251231_NSE vF.xlsx"));
  });
  await test("vF2 suffix + xlsm handled", () => {
    assert.equal(vfDedupKey("20250101_Foo vF2.xlsm"), "foo");
  });
  await test("non-vF name → empty key (no carry-forward match)", () => {
    assert.equal(vfDedupKey(""), "");
  });

  console.log("applyCarryForward precedence & staleness:");
  const today = "2026-06-18";
  const prev = buildPrev([
    { tikr: "AAA", _vf_source: "20260101_AAA vF.xlsx", _vf_method: "graph", bear_current: 100 },
    { tikr: "BBB", _vf_source: "20260101_BBB vF.xlsx", _vf_method: "xlsx", bear_current: 200 },
    { tikr: "CCC", _vf_source: "20260101_CCC vF.xlsx", _vf_method: "graph", bear_current: 300 }, // standalone-only
    { tikr: "DDD", _vf_source: "20260101_DDD vF.xlsx", _vf_method: "graph", bear_current: 400, _vf_carried_forward: true, _vf_stale_since: "2026-01-10" },
    { tikr: "GGG", _vf_source: "20260101_GGG vF.xlsx", _vf_method: "graph", bear_current: 700 }, // file removed this run
  ]);

  await test("fresh vF wins over carry-forward", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "AAA", bear_current: 999 }];
    applyCarryForward(merged, prev, new Set(["AAA"]), ["20260615_AAA vF.xlsx"], today);
    assert.equal(merged[0].bear_current, 999);
    assert.notEqual(merged[0]._vf_carried_forward, true);
  });

  await test("carry-forward beats empty baseline (present-but-failed)", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "BBB", bear_current: null }];
    const r = applyCarryForward(merged, prev, new Set(), ["20260615_BBB vF.xlsx"], today);
    assert.equal(merged[0].bear_current, 200);
    assert.equal(merged[0]._vf_carried_forward, true);
    assert.equal(merged[0]._vf_stale_since, today); // prev was fresh → clock starts today
    assert.equal(r.carriedTikrs.has("bbb"), true);
  });

  await test("no carry when file not present-but-failed (parsed fresh / removed)", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "BBB", bear_current: null }];
    applyCarryForward(merged, prev, new Set(), [], today);  // BBB not in failed list
    assert.equal(merged[0].bear_current, null);
    assert.notEqual(merged[0]._vf_carried_forward, true);
  });

  await test("staleness clock does NOT reset across consecutive carried runs", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "DDD", bear_current: null }];
    applyCarryForward(merged, prev, new Set(), ["20260615_DDD vF.xlsx"], today);
    assert.equal(merged[0].bear_current, 400);
    assert.equal(merged[0]._vf_stale_since, "2026-01-10"); // preserved, not today
  });

  await test("standalone-only prev stock re-added when its file failed", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "AAA", bear_current: 1 }];
    applyCarryForward(merged, prev, new Set(["AAA"]), ["20260615_CCC vF.xlsx"], today);
    const ccc = merged.find(s => s.tikr === "CCC");
    assert.ok(ccc, "CCC should be re-added");
    assert.equal(ccc!.bear_current, 300);
    assert.equal(ccc!._vf_carried_forward, true);
  });

  await test("removed-from-folder stock NOT resurrected", () => {
    const merged: Record<string, unknown>[] = [{ tikr: "AAA", bear_current: 1 }];
    // GGG's file is absent this run → not in failedFiles → must not reappear.
    applyCarryForward(merged, prev, new Set(["AAA"]), ["20260615_BBB vF.xlsx"], today);
    assert.equal(merged.find(s => s.tikr === "GGG"), undefined);
  });

  console.log("isFloorBreached:");
  await test("collapse below fraction trips the gate", () => {
    assert.equal(isFloorBreached(40, 100, 0.5), true);
    assert.equal(isFloorBreached(60, 100, 0.5), false);
    assert.equal(isFloorBreached(0, 0, 0.5), false);   // no prev → never trips
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("FAILED:", failures.join(", "));
    process.exit(1);
  }
}

main().catch(e => { console.error("harness error:", e); process.exit(1); });
