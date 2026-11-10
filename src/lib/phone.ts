/**
 * Phone-number helpers.
 *
 * Accounts are identified by phone number only (e-mail sign-in was removed),
 * so the same number has to be recognised however it was typed: "+964 770 642
 * 5337", "009647706425337", "07706425337" or "9647706425337".
 */

/** Digits only, separators dropped. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Canonical form: `+<country><number>`.
 *
 * National formats are promoted using the two countries this site serves:
 * `07…` → Iraq (+964, the default), `05…` → Turkey (+90). `00…` is treated as
 * the international prefix.
 */
export function canonicalPhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s().\-–—]/g, "");
  if (!cleaned) return "";

  const digits = phoneDigits(cleaned);
  if (!digits) return "";

  if (cleaned.startsWith("00")) return `+${digits.slice(2)}`;
  if (cleaned.startsWith("+")) return `+${digits}`;
  if (cleaned.startsWith("0")) {
    const national = digits.slice(1);
    // Turkish mobiles are 05…, everything else on this site is Iraqi 07….
    return national.startsWith("5") ? `+90${national}` : `+964${national}`;
  }
  return `+${digits}`;
}

/**
 * Every format the number could be stored in, best guess first. Used for
 * parameterised `.eq()` lookups — user input is never interpolated into a
 * PostgREST filter string.
 */
export function phoneVariants(raw: string): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  const trimmed = raw.trim();
  const digits = phoneDigits(raw);
  const canonical = canonicalPhone(raw);

  add(trimmed); // exactly as stored (legacy rows: "07706425337")
  add(canonical); // "+9647706425337"
  add(digits); // "9647706425337"

  if (canonical.startsWith("+964")) add(`0${canonical.slice(4)}`);
  else if (canonical.startsWith("+90")) add(`0${canonical.slice(3)}`);

  if (trimmed.startsWith("00")) add(`+${digits.slice(2)}`);

  return out;
}

/**
 * Lookup order for account searches: the canonical form comes first, then
 * every other spelling. All writings of one number ("07706425337",
 * "+9647706425337", "009647706425337") therefore resolve to the same leading
 * candidate — without this, a step that reads the canonical value (the reset
 * cookie) and a step that reads raw user input could land on different rows
 * if a duplicate ever slipped in.
 */
export function lookupVariants(raw: string): string[] {
  const all = phoneVariants(raw);
  const canonical = canonicalPhone(raw);
  if (!canonical || !all.includes(canonical)) return all;
  return [canonical, ...all.filter((value) => value !== canonical)];
}

/** A plausible E.164 number: 7–15 digits after normalization. */
export function isValidPhone(raw: string): boolean {
  const digits = phoneDigits(canonicalPhone(raw));
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Canonical `+<country><number>` for the two mobile ranges this site serves
 * (Iraqi 07… → +9647…, Turkish 05… → +905…), or `""` when the number is not a
 * valid mobile of either country. SMS gateways expect exactly this shape.
 */
export function toE164(raw: string): string {
  const e164 = canonicalPhone(raw);
  return /^\+9647\d{9}$/.test(e164) || /^\+905\d{9}$/.test(e164) ? e164 : "";
}
