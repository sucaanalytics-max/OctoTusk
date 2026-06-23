/**
 * Daily DhanHQ access-token refresh (run by .github/workflows/refresh-dhan-token.yml).
 *
 * DhanHQ access tokens expire 24h after generation. This mints a fresh one headlessly
 * (PIN + TOTP), pushes it into the Vercel production env var DHAN_ACCESS_TOKEN, and
 * triggers a redeploy so the runtime functions pick it up.
 *
 *   npx tsx scripts/refresh-dhan-token.ts            # real run (needs the env below)
 *   npx tsx scripts/refresh-dhan-token.ts --selftest # validate TOTP crypto, no secrets
 *
 * Required env (GitHub Actions secrets): DHAN_CLIENT_ID, DHAN_PIN, DHAN_TOTP_SECRET,
 * VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID, VERCEL_DEPLOY_HOOK_URL.
 * Secrets are NEVER logged.
 */

"use strict";

import crypto from "node:crypto";

// ── RFC 4648 base32 decode ──────────────────────────────────────────────────
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 character in TOTP secret`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) ───────────────────────────
function totp(secretBase32: string, forTimeSec?: number, step = 30, digits = 6): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor((forTimeSec ?? Date.now() / 1000) / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

function selfTest(): void {
  // RFC 6238 SHA-1 test vectors (secret = ASCII "12345678901234567890").
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const cases: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
  ];
  for (const [t, expected] of cases) {
    const got = totp(secret, t);
    if (got !== expected) throw new Error(`TOTP self-test FAILED at t=${t}: got ${got}, expected ${expected}`);
  }
  console.log(`TOTP self-test PASSED (${cases.length} RFC-6238 vectors)`);
}

function need(key: string): string {
  const v = process.env[key];
  if (!v || !v.trim()) throw new Error(`missing required env var: ${key}`);
  return v.trim();
}

// ── Vercel env update ───────────────────────────────────────────────────────
const VERCEL_API = "https://api.vercel.com";

async function findEnvId(projectId: string, teamId: string, token: string, key: string): Promise<string> {
  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/env?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Vercel env list failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as { envs?: Array<{ id: string; key: string; target?: string[] | string }> };
  const match = (data.envs ?? []).find((e) => {
    if (e.key !== key) return false;
    const t = e.target;
    return Array.isArray(t) ? t.includes("production") : t === "production";
  });
  if (!match) throw new Error(`Vercel env var ${key} (production) not found — create it once, then this job updates it`);
  return match.id;
}

async function patchEnvValue(projectId: string, teamId: string, token: string, envId: string, value: string): Promise<void> {
  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/env/${envId}?teamId=${teamId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Vercel env PATCH failed: ${res.status} ${await res.text().catch(() => "")}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--selftest")) {
    selfTest();
    return;
  }

  const clientId = need("DHAN_CLIENT_ID");
  const pin = need("DHAN_PIN");
  const totpSecret = need("DHAN_TOTP_SECRET");
  const vercelToken = need("VERCEL_TOKEN");
  const projectId = need("VERCEL_PROJECT_ID");
  const teamId = need("VERCEL_TEAM_ID");
  const deployHook = need("VERCEL_DEPLOY_HOOK_URL");

  // 1) Mint a fresh 24h token via the headless PIN + TOTP endpoint.
  // NOTE: Dhan's generateAccessToken API accepts dhanClientId/pin/totp ONLY as URL query
  // params — there is no JSON-body or header variant (confirmed against the DhanHQ v2 auth
  // docs). The request is HTTPS (params encrypted in transit) and this URL is NEVER logged;
  // the catch below sanitises any thrown network error (whose `cause` can embed the URL) so
  // the PIN/TOTP can never leak into CI logs.
  const code = totp(totpSecret);
  const mintUrl =
    `https://auth.dhan.co/app/generateAccessToken` +
    `?dhanClientId=${encodeURIComponent(clientId)}&pin=${encodeURIComponent(pin)}&totp=${encodeURIComponent(code)}`;
  let mintRes: Awaited<ReturnType<typeof fetch>>;
  try {
    mintRes = await fetch(mintUrl, { method: "POST", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Dhan token mint request failed (network error reaching auth.dhan.co)");
  }
  const mintBody = (await mintRes.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = typeof mintBody.accessToken === "string" ? mintBody.accessToken : "";
  if (!mintRes.ok || !accessToken) {
    // Log only non-secret diagnostic fields (never the token).
    const diag = { status: mintRes.status, errorType: mintBody.errorType, errorCode: mintBody.errorCode, errorMessage: mintBody.errorMessage };
    throw new Error(`Dhan token mint failed: ${JSON.stringify(diag)}`);
  }
  const expiry = typeof mintBody.expiryTime === "string" ? mintBody.expiryTime : "unknown";

  // 2) Push it into the Vercel production env var.
  const envId = await findEnvId(projectId, teamId, vercelToken, "DHAN_ACCESS_TOKEN");
  await patchEnvValue(projectId, teamId, vercelToken, envId, accessToken);

  // 3) Redeploy so runtime functions read the new value (env binds at deploy time).
  // The deploy-hook URL is itself a secret, so sanitise any network error too.
  let hookRes: Awaited<ReturnType<typeof fetch>>;
  try {
    hookRes = await fetch(deployHook, { method: "POST" });
  } catch {
    throw new Error("Vercel deploy hook request failed (network error)");
  }
  if (!hookRes.ok) throw new Error(`Vercel deploy hook failed: ${hookRes.status}`);

  console.log(`OK: Dhan access token refreshed (expires ${expiry}); Vercel env updated + redeploy triggered.`);
}

main().catch((err) => {
  console.error(`[refresh-dhan-token] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
