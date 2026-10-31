import { createHmac, createHash } from "node:crypto";

/**
 * Presigned-URL helpers for S3-compatible object storage.
 *
 * Works with Backblaze B2 (no credit card required — use a PRIVATE bucket)
 * and Cloudflare R2 (requires a payment method on file). Videos are stored
 * out-of-band from the serverless runtime, bypassing both the Supabase
 * free-plan 50 MB/file cap and the Vercel body limit.
 *
 * With a private bucket (the default B2 setup), the DB stores the canonical
 * object URL and the memorial page mints a short-lived presigned GET URL on
 * every render, so files are never publicly listable/downloadable without
 * going through the app.
 *
 * Required env:
 *   S3_ENDPOINT       e.g. https://s3.us-west-004.backblazeb2.com
 *                     or   https://<accountid>.r2.cloudflarestorage.com
 *   S3_REGION         e.g. us-west-004   (R2: "auto")
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_BUCKET
 * Optional env:
 *   S3_PUBLIC_BASE    public CDN base for the bucket (only if the bucket is
 *                     public, e.g. https://pub-xxxx.r2.dev). When unset,
 *                     playback uses presigned GET URLs (private bucket).
 */

const PLAYBACK_TTL_SEC = 60 * 60 * 24; // 24h — page re-renders per visit

function endpoint(): string {
  return (process.env.S3_ENDPOINT ?? "").replace(/\/+$/, "");
}

function bucket(): string {
  return process.env.S3_BUCKET ?? "";
}

export function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET
  );
}

/** Stable object URL stored in the DB (never expires, never signed). */
export function s3CanonicalUrl(key: string): string {
  return `${endpoint()}/${bucket()}/${key}`;
}

/** Reverse of s3CanonicalUrl; null when the URL is not ours. */
export function s3KeyFromUrl(url: string): string | null {
  const root = `${endpoint()}/${bucket()}/`;
  return url.startsWith(root) ? url.slice(root.length) : null;
}

/**
 * Turns a stored URL into something the browser can play. Our canonical S3
 * URLs become presigned GET URLs (private bucket) or public-CDN URLs; any
 * other URL (Supabase etc.) passes through unchanged.
 */
export function playbackUrl(url: string): string {
  const key = s3KeyFromUrl(url);
  if (key === null) return url;
  const base = (process.env.S3_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  return base ? `${base}/${key}` : s3SignedUrl("GET", key, PLAYBACK_TTL_SEC);
}

/**
 * SigV4 presigned URL (region from env, payload UNSIGNED-PAYLOAD, only the
 * `host` header signed — the browser may send any content-type alongside).
 * Max expiry is 7 days on both B2 and R2.
 */
export function s3SignedUrl(
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  expiresSec = 3600
): string {
  const host = new URL(endpoint()).host;
  const region = process.env.S3_REGION!;
  const accessKey = process.env.S3_ACCESS_KEY_ID!;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY!;
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261031T120000Z
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalUri = `/${bucket()}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  });
  // Canonical query string must be sorted by encoded key.
  const canonicalQuery = [...query.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");

  // CanonicalHeaders ends with its own "\n" — that is what produces the blank
  // line before SignedHeaders in the canonical request.
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const sha256hex = (s: string) =>
    createHash("sha256").update(s, "utf8").digest("hex");
  const hmac = (key: Buffer | string, data: string) =>
    createHmac("sha256", key).update(data, "utf8").digest();

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Best-effort deletion of an object (used when the user removes a video). */
export async function s3Delete(key: string): Promise<void> {
  try {
    await fetch(s3SignedUrl("DELETE", key, 300), { method: "DELETE" });
  } catch {
    // removal is best-effort; never fail the UI over cleanup
  }
}

/** Verifies the object exists (presigned HEAD — works on private buckets). */
export async function s3Exists(key: string): Promise<boolean> {
  try {
    const res = await fetch(s3SignedUrl("HEAD", key, 300), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
