import { headers } from "next/headers";

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Per-instance (resets on cold start and is not shared across serverless
 * instances) — enough to blunt brute-force and abuse, but not a substitute
 * for an edge/WAF rule on very high traffic.
 */

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 5000;

const buckets = new Map<string, number[]>();

/** Records a hit for `key`. Returns true when the caller is over `max`. */
export function hit(key: string, max: number, windowMs = DEFAULT_WINDOW_MS): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true; // blocked
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return false;
}

/** Best-effort client IP for per-IP limiting (behind Vercel/proxies). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    return h.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown"; // no request context (e.g. background)
  }
}
