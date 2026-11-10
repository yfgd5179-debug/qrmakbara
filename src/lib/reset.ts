import { createHmac } from "node:crypto";

/**
 * Short-lived cookies that carry the password-reset progress so the customer
 * only ever types their phone number once: the code step and the password
 * step both read it from here instead of asking for it again.
 *
 * Server-only module (Node crypto) — client components receive masked values
 * as props instead of importing from here.
 */
export const RESET_PHONE_COOKIE = "qr_reset_phone";
export const RESET_OK_COOKIE = "qr_reset_ok";
export const RESET_TTL_SECONDS = 15 * 60;

/** Flags shared by both cookies — httpOnly so page scripts can never read them. */
export const resetCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: RESET_TTL_SECONDS,
};

/**
 * Proof that the SMS code was verified for this canonical phone number: an
 * HMAC keyed with the Supabase service-role secret — a value only the server
 * ever sees — so the client cannot mint it itself.
 */
export function resetOkToken(canonical: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "qr-reset";
  return createHmac("sha256", key).update(canonical).digest("hex");
}

/** `+9647700009991` → `+9647***991`, for echoing the number back safely. */
export function maskPhone(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 5)}***${value.slice(-3)}`;
}
