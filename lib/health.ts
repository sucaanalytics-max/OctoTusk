/**
 * Shared health tracking utilities — imported by API routes
 * In-memory counters reset on cold start (acceptable for serverless)
 */

// Simple in-memory error counter
export const errorCounts: Record<string, number> = {
  sync: 0,
  quotes: 0,
  enrichment: 0,
  chart: 0,
  holdings: 0,
  zones: 0,
  refresh: 0,
};

// Track last successful operations
export const lastSuccess: Record<string, string | null> = {
  sync: null,
  quotes: null,
};

/** Called by API routes to report errors */
export function reportError(route: string) {
  if (route in errorCounts) errorCounts[route]++;
}

/** Called by API routes to report successful operations */
export function reportSuccess(route: string) {
  if (route in lastSuccess) lastSuccess[route] = new Date().toISOString();
}
