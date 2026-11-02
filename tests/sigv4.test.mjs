/**
 * End-to-end signature cross-check: our src/lib/s3.ts presigner vs the
 * OFFICIAL AWS implementation (@smithy/signature-v4), same inputs → the
 * signatures (and thus canonical request, string-to-sign, key derivation)
 * must be byte-identical.
 */
process.env.S3_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
process.env.S3_REGION = "us-west-004";
process.env.S3_ACCESS_KEY_ID = "AKIDEXAMPLE";
process.env.S3_SECRET_ACCESS_KEY =
  "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
process.env.S3_BUCKET = "uploads";

const RealDate = Date;
const fixedMs = new RealDate("2026-10-31T12:00:00.000Z").getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixedMs);
    else super(...args);
  }
  static now() {
    return fixedMs;
  }
};

import { createHash, createHmac } from "node:crypto";

// HashConstructor compatible with @smithy/signature-v4 (plain + HMAC modes).
class Sha256 {
  constructor(secret) {
    this.h =
      secret === undefined
        ? createHash("sha256")
        : createHmac("sha256", secret);
  }
  update(data) {
    this.h.update(typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data));
  }
  async digest() {
    return new Uint8Array(this.h.digest());
  }
}

const { s3SignedUrl } = await import("../src/lib/s3.ts");
const { SignatureV4 } = await import("@smithy/signature-v4");

const HOST = "s3.us-west-004.backblazeb2.com";
const KEY = "mem-1/v-abc.mp4";

const signer = new SignatureV4({
  service: "s3",
  region: "us-west-004",
  credentials: {
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  },
  sha256: Sha256,
  uriEscapePath: true,
  applyChecksum: false,
});

function parse(url) {
  const u = new URL(url);
  const q = Object.fromEntries(u.searchParams);
  const sig = q["X-Amz-Signature"];
  delete q["X-Amz-Signature"];
  return { path: u.pathname, query: q, sig };
}

async function theirs(method, rawKey, contentType) {
  const headers = {
    host: HOST,
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
  };
  if (contentType) headers["content-type"] = contentType;
  const signed = await signer.presign(
    {
      method,
      protocol: "https:",
      hostname: HOST,
      port: undefined,
      path: `/uploads/${rawKey}`, // raw (unescaped); signer escapes it
      query: {},
      headers,
      username: undefined,
      password: undefined,
      fragment: undefined,
    },
    { expiresIn: 3600, signingDate: new RealDate(fixedMs) }
  );
  const qs = Object.entries(signed.query)
    .map(([k, v]) => [k, v])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");
  return `https://${HOST}${signed.path}?${qs}`;
}

let failed = false;
async function check(name, method, rawKey, contentType) {
  const oursRaw = s3SignedUrl(method, rawKey, 3600, contentType);
  const theirsRaw = await theirs(method, rawKey, contentType);
  const a = parse(oursRaw);
  const b = parse(theirsRaw);
  // Compare decoded paths: the harness rebuilds "theirs" via new URL(),
  // which leaves raw parens alone, while both signers escape them in the
  // signature — decode makes the paths comparable.
  const samePath = decodeURIComponent(a.path) === decodeURIComponent(b.path);
  const sameQuery = JSON.stringify(a.query) === JSON.stringify(b.query);
  const sameSig = a.sig === b.sig;
  const ok = samePath && sameQuery && sameSig;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    if (!samePath) console.log(`  path:   ours=${a.path}\n          theirs=${b.path}`);
    if (!sameQuery) {
      console.log(`  query:  ours=  ${JSON.stringify(a.query, null, 2)}`);
      console.log(`  query:  theirs=${JSON.stringify(b.query, null, 2)}`);
    }
    if (!sameSig) {
      console.log(`  sig:    ours=${a.sig}`);
      console.log(`  sig:    theirs=${b.sig}`);
      console.log(`  url:    ours=  ${oursRaw}`);
      console.log(`  url:    theirs=${theirsRaw}`);
    }
  }
}

await check("GET plain key", "GET", KEY);
await check("GET special chars in key", "GET", "mem-1/my file (1).mp4");
await check("PUT plain key + content-type", "PUT", KEY, "video/mp4");
await check(
  "PUT special key + content-type",
  "PUT",
  "mem-1/my file (1).mp4",
  "video/quicktime"
);
await check("HEAD plain key", "HEAD", KEY);
await check("DELETE plain key", "DELETE", KEY);

process.exit(failed ? 1 : 0);
