import { createHmac, createHash } from "node:crypto";

/**
 * Minimal S3 (SigV4) signed-URL helper for Cloudflare R2.
 *
 * R2 is S3-compatible, so we can mint presigned PUT/DELETE URLs without the
 * heavy @aws-sdk dependency. Videos go straight from the browser to R2,
 * bypassing both the Supabase free-plan 50 MB/file cap and the Vercel
 * serverless body limit — while staying inside R2's free tier
 * (10 GB storage, zero egress fees).
 *
 * Required env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_BASE (e.g. https://pub-xxxx.r2.dev or a custom domain)
 */

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE
  );
}

function r2PublicBase(): string {
  return (process.env.R2_PUBLIC_BASE ?? "").replace(/\/+$/, "");
}

/** Public (CDN) URL used by memorial pages to play the video. */
export function r2PublicUrl(key: string): string {
  return `${r2PublicBase()}/${key}`;
}

/** Reverse of r2PublicUrl; returns null when the URL is not an R2 URL. */
export function r2KeyFromUrl(url: string): string | null {
  const base = r2PublicBase();
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}

/**
 * Creates a presigned URL (SigV4, region "auto") for PUT uploads or DELETE
 * removals. Only the `host` header is signed, so the browser may send any
 * content-type with the upload.
 */
export function r2SignedUrl(
  method: "PUT" | "DELETE",
  key: string,
  expiresSec = 3600
): string {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261031T120000Z
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

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
export async function r2Delete(key: string): Promise<void> {
  try {
    await fetch(r2SignedUrl("DELETE", key, 300), { method: "DELETE" });
  } catch {
    // removal is best-effort; an orphan object costs nothing on the free tier
  }
}

/** Verifies the object exists and is publicly reachable (HEAD on public URL). */
export async function r2Exists(key: string): Promise<boolean> {
  try {
    const res = await fetch(r2PublicUrl(key), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
