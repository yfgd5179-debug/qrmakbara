import { headers } from "next/headers";
import { supabase } from "./db";

/**
 * Sliding-window rate limiter.
 *
 * The window lives in Postgres (`rate_limit_hit`, see supabase/schema.sql)
 * so limits survive cold starts and are shared across serverless instances.
 * When the function is unavailable (migration not yet run, Supabase
 * unreachable) the limiter silently falls back to a per-instance in-memory
 * window — weaker, but still enough to blunt brute-force attempts.
 */

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 5000;

/** Per-instance fallback; mirrors the Postgres function's semantics. */
const buckets = new Map<string, number[]>();

function memoryHit(key: string, max: number, windowMs: number): boolean {
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

/**
 * Records a hit for `key`. Returns true when the caller is over `max`.
 *
 * Async because the authoritative window is a Postgres RPC; every call
 * site awaits it. Any RPC failure degrades to the in-memory window instead
 * of letting rate limiting take the auth flow down with it.
 */
export async function hit(
  key: string,
  max: number,
  windowMs = DEFAULT_WINDOW_MS
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_ms: windowMs,
    });
    if (error) throw error;
    return Boolean(data);
  } catch {
    return memoryHit(key, max, windowMs);
  }
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
