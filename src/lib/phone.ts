/**
 * Iraqi mobile numbers: 11 digits, always starting with 07 (e.g. 0770 123 4567).
 * Accounts sign in with this number, so every entry point normalizes it the
 * same way: `+964 770…`, `00964…` and `964…` all become `0770…`.
 */
export const IQ_PHONE_RE = /^07\d{9}$/;

/** Strips formatting and converts international Iraqi prefixes to the local 07 form. */
export function normalizePhone(input: string): string {
  let digits = (input ?? "").trim().replace(/[^\d]/g, "");
  if (digits.startsWith("00964")) digits = "0" + digits.slice(5);
  else if (digits.startsWith("964") && digits.length > 10) digits = "0" + digits.slice(3);
  else if (digits.startsWith("7") && digits.length === 10) digits = "0" + digits;
  return digits;
}

export function isValidPhone(input: string): boolean {
  return IQ_PHONE_RE.test(normalizePhone(input));
}

/**
 * Local `07XXXXXXXXX` → E.164 `+9647XXXXXXXXX`, the format every SMS gateway
 * expects. Returns "" for numbers that are not valid Iraqi mobiles.
 */
export function toE164(input: string): string {
  const local = normalizePhone(input);
  return IQ_PHONE_RE.test(local) ? `+964${local.slice(1)}` : "";
}

/**
 * Stored numbers may predate normalization (older rows saved "+964770…"), so
 * lookups try the canonical form plus the international spellings.
 */
export function phoneVariants(input: string): string[] {
  const local = normalizePhone(input);
  if (!IQ_PHONE_RE.test(local)) return [input.trim()].filter(Boolean);
  const rest = local.slice(1);
  return [local, `+964${rest}`, `964${rest}`, `00964${rest}`];
}
