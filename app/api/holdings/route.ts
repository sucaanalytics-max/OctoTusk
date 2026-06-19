import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import staticDb from "@/data/database.json";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import { checkPinLockout, recordPinFailure, clearPinFailures } from "@/lib/pinLockout";

export const dynamic = "force-dynamic";

function lockedResponse(retryAfterSec?: number) {
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 60) } }
  );
}

/**
 * POST /api/holdings — Session + PIN gated holdings data
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedHash = process.env.HOLDINGS_PIN_HASH;
  if (!expectedHash) {
    console.error("[/api/holdings] HOLDINGS_PIN_HASH env var is not set");
    return NextResponse.json({ error: "Holdings unavailable — contact admin" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    // H3: server-side brute-force lockout, keyed by user email (shared across instances,
    // survives cold starts — unlike the per-instance IP limiter). Fail-open on infra error.
    const email = session.user.email ?? "";
    const lock = await checkPinLockout(email);
    if (lock.locked) {
      return lockedResponse(lock.retryAfterSec);
    }

    // Constant-time compare (H2): avoid leaking PIN correctness via timing.
    // Both sides are SHA-256 digests (32 bytes); timingSafeEqual requires equal length.
    const pinDigest = crypto.createHash("sha256").update(pin).digest();
    let expectedDigest: Buffer;
    try {
      expectedDigest = Buffer.from(expectedHash, "hex");
    } catch {
      expectedDigest = Buffer.alloc(0);
    }
    const pinValid =
      expectedDigest.length === pinDigest.length &&
      crypto.timingSafeEqual(pinDigest, expectedDigest);
    if (!pinValid) {
      const after = await recordPinFailure(email);
      if (after.locked) return lockedResponse(after.retryAfterSec);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    // Successful unlock — reset the failure counter.
    await clearPinFailures(email);

    let holdings: unknown[] = (staticDb as Record<string, unknown>).holdings as unknown[] || [];
    let fo_positions: unknown[] = (staticDb as Record<string, unknown>).fo_positions as unknown[] || [];
    let holdingsDate: string = ((staticDb as Record<string, unknown>).metadata as Record<string, string>)?.holdings_date || "unknown";
    let source = "static";

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("sync_snapshot")
          .select("holdings, fo_positions, synced_at")
          .eq("id", 1)
          .single();

        if (!error && data) {
          const snapshotHoldings = data.holdings;
          if (Array.isArray(snapshotHoldings) && snapshotHoldings.length > 0) {
            holdings = snapshotHoldings;
            holdingsDate = (data.synced_at as string) ?? holdingsDate;
            source = "supabase";
          }
          const snapshotFo = data.fo_positions;
          fo_positions = Array.isArray(snapshotFo) ? snapshotFo : [];
        }
      } catch (err) {
        console.warn("[/api/holdings] Snapshot query failed, using static fallback:", err instanceof Error ? err.message : err);
      }
    }

    // H5: never cache the sensitive holdings payload (browser / CDN / SW).
    return NextResponse.json(
      { holdings, fo_positions, unlocked: true, holdingsDate, source },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" } }
    );
  } catch (error: unknown) {
    console.error("[/api/holdings] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
