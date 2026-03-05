import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";

// ── In-memory rate limiter ──
// Simple sliding window per IP. Resets on cold start (acceptable for Vercel serverless).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  "/api/holdings": 10,  // Sensitive endpoint: 10 req/min
  "/api/sync": 5,       // Heavy operation: 5 req/min
  default: 30,          // All other API routes: 30 req/min
};

function getRateLimit(pathname: string): number {
  const entries = Object.entries(RATE_LIMITS);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i][0] !== "default" && pathname.startsWith(entries[i][0])) return entries[i][1];
  }
  return RATE_LIMITS.default;
}

function checkRateLimit(ip: string, pathname: string): { allowed: boolean; remaining: number; limit: number } {
  const limit = getRateLimit(pathname);
  const key = `${ip}:${pathname.split("/").slice(0, 4).join("/")}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: limit - 1, limit };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, limit };
  }
  return { allowed: true, remaining: limit - entry.count, limit };
}

// Periodically clean up stale entries (every 100 requests)
let cleanupCounter = 0;
function maybeCleanup() {
  cleanupCounter++;
  if (cleanupCounter % 100 === 0) {
    const now = Date.now();
    const keys = Array.from(rateLimitMap.keys());
    for (let i = 0; i < keys.length; i++) {
      const entry = rateLimitMap.get(keys[i]);
      if (entry && now > entry.resetAt) rateLimitMap.delete(keys[i]);
    }
  }
}

// ── Middleware ──
export default auth((req: NextRequest) => {
  const { pathname } = req.nextUrl;

  // Skip auth routes — NextAuth needs these open
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Apply rate limiting to all API routes
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
    maybeCleanup();

    const { allowed, remaining, limit } = checkRateLimit(ip, pathname);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  }

  // For dashboard routes, NextAuth middleware handles auth automatically
  return NextResponse.next();
}) as any;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/:path*",
  ],
};
