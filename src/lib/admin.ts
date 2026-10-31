import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Admin access uses an HMAC-signed, httpOnly cookie instead of a `?key=`
 * query parameter — the key never appears in URLs, browser history or
 * server logs.
 */
const COOKIE = "admin_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function expectedAdminKey(): string {
  return (
    process.env.ADMIN_KEY ??
    (process.env.NODE_ENV !== "production" ? "admin123" : "")
  );
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function verifyAdminKey(candidate: string): boolean {
  const expected = expectedAdminKey();
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mints the signed cookie after a correct key is submitted. */
export async function createAdminSession(): Promise<void> {
  const key = expectedAdminKey();
  if (!key) return;
  const exp = Date.now() + TTL_MS;
  const payload = `admin.${exp}`;
  const token = `${payload}.${sign(payload, key)}`;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const key = expectedAdminKey();
  if (!key) return false;
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [name, expStr, mac] = parts;
  if (name !== "admin") return false;
  const exp = Number(expStr);
  if (!exp || Date.now() > exp) return false;
  const expectedMac = sign(`admin.${expStr}`, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  return a.length === b.length && timingSafeEqual(a, b);
}
