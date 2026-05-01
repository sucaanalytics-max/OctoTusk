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

// ── Structured audit logging ──
// Vercel captures console.log as structured logs; Vercel Log Drain can forward to external SIEM
function auditLog(req: NextRequest, status: number, extra?: Record<string, unknown>) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
  const user = (req as any).auth?.user?.email || "anonymous";
  const entry = {
    _audit: true,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.nextUrl.pathname,
    status,
    ip,
    user,
    userAgent: (req.headers.get("user-agent") || "").slice(0, 120),
    origin: req.headers.get("origin") || null,
    ...extra,
  };
  console.log(JSON.stringify(entry));
}

// ── CORS: allowed origins ──
const ALLOWED_ORIGINS = [
  "https://octo-tusk.vercel.app",
  "https://octotusk.tuskinvest.com",
];
if (process.env.NODE_ENV === "development") {
  ALLOWED_ORIGINS.push("http://localhost:3000");
}

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow any *.vercel.app origin in Vercel Preview deployments.
  // Still protected by NextAuth — this unblocks same-project preview URLs
  // whose hostname changes per-deploy and can't be hardcoded.
  if (process.env.VERCEL_ENV === "preview" && origin.endsWith(".vercel.app")) return true;
  return false;
}

function applyCors(response: NextResponse, origin: string | null): NextResponse {
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

// ── Middleware ──
export default auth((req: NextRequest) => {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // Skip auth routes — NextAuth needs these open
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Skip health check — public endpoint for uptime monitoring
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Handle CORS preflight (OPTIONS)
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const preflightRes = new NextResponse(null, { status: 204 });
    return applyCors(preflightRes, origin);
  }

  // Block cross-origin requests from unauthorized domains
  if (pathname.startsWith("/api/") && origin && !isAllowedOrigin(origin)) {
    auditLog(req, 403, { reason: "forbidden_origin", blockedOrigin: origin });
    return NextResponse.json(
      { error: "Forbidden origin" },
      { status: 403 }
    );
  }

  // Apply rate limiting to all API routes
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
    maybeCleanup();

    const { allowed, remaining, limit } = checkRateLimit(ip, pathname);
    if (!allowed) {
      auditLog(req, 429, { reason: "rate_limit_exceeded", limit });
      return applyCors(
        NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": "0",
            },
          }
        ),
        origin
      );
    }

    // Audit log the API request
    auditLog(req, 200, { rateLimit: { remaining, limit } });

    // Add rate limit + CORS headers to successful responses
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return applyCors(response, origin);
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
