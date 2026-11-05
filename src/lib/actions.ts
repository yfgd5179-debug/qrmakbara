"use server";

import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateStory } from "./ai";
import {
  createAdminSession,
  destroyAdminSession,
  isAdmin,
  verifyAdminKey,
} from "./admin";
import {
  createSession,
  destroySession,
  getSession,
  hashPassword,
  verifyPassword,
} from "./auth";
import { paymentMethods, priceFor, type PaymentMethod } from "./commerce";
import { supabase, newId, parseList } from "./db";
import { hasLocale } from "./dict";
import { isValidPhone, normalizePhone, phoneVariants, toE164 } from "./phone";
import { hit, clientIp } from "./ratelimit";
import { resetCodeMessage, sendSms } from "./sms";
import { s3CanonicalUrl, s3Configured, s3Delete, s3Exists, s3KeyFromUrl, s3SignedUrl } from "./s3";
import type { Locale, Memorial, Order, StoryResult } from "./types";

export type FormState = { error?: string } | null;

/**
 * Accounts are phone-only, but the legacy `users.email` column is NOT NULL and
 * unique. Store a deterministic, non-deliverable (.invalid) address so the
 * constraint is satisfied without ever asking the user for an email.
 */
function internalEmail(phone: string): string {
  return `${phone}@phone.invalid`;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tail = randomBytes(3).toString("hex");
  return `${base || "memorial"}-${tail}`;
}

/**
 * Loads a memorial owned by `userId`, or null. Returning null (instead of
 * throwing) lets the server actions answer with a normal error the UI can
 * show — a throw here would surface as an opaque "server error" toast.
 */
async function getMemorial(id: string, userId: string): Promise<Memorial | null> {
  const { data: row } = await supabase
    .from("memorials")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row || (row as Memorial).user_id !== userId) return null;
  return row as Memorial;
}

/* ---------------------------- auth ---------------------------- */

export async function registerAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  // The phone number is the only identifier: sign-up and sign-in both use it.
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const country = String(formData.get("country") ?? "IQ");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  if (!isValidPhone(phone)) return { error: "phone" };
  if (password.length < 6) return { error: "password" };
  if (!name) return { error: "name" };

  // Cap sign-ups per IP to slow bulk account creation.
  if (hit(`register:ip:${await clientIp()}`, 10)) return { error: "rate" };

  // The phone is the login identifier, so it must be unique.
  const { data: phoneTaken } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (phoneTaken) return { error: "phoneExists" };

  const id = newId();
  const { error: insertError } = await supabase.from("users").insert({
    id,
    email: internalEmail(phone),
    password_hash: hashPassword(password),
    name,
    phone,
    country,
    created_at: new Date().toISOString(),
  });
  // A silent failure here used to log the user in as a ghost (session insert
  // would fail on the foreign key) and bounce them back to /login.
  if (insertError) return { error: "error" };
  await createSession(id);
  redirect(home);
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const identifier = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  // Numbers are validated before touching the database so a typo gets a
  // useful "must start with 07" message instead of "wrong password".
  if (!isValidPhone(identifier)) return { error: "phone" };
  if (!password) return { error: "invalid" };

  // Throttle brute-force: per identifier+IP, plus a looser per-IP cap.
  const ip = await clientIp();
  if (
    hit(`login:id:${identifier.toLowerCase()}`, 10) ||
    hit(`login:ip:${ip}`, 30)
  ) {
    return { error: "rate" };
  }

  // Never interpolate user input into a PostgREST `.or()` filter string —
  // that is a filter-injection vector. Parameterized `.in()` over the known
  // spellings of the number (07…, +964…, 964…, 00964…) is safe and also
  // matches rows saved before numbers were normalized.
  const { data: byPhone } = await supabase
    .from("users")
    .select("*")
    .in("phone", phoneVariants(identifier))
    .limit(1)
    .maybeSingle();
  const row = byPhone;

  if (!row || !verifyPassword(password, (row as { password_hash: string }).password_hash)) {
    return { error: "invalid" };
  }
  await createSession((row as { id: string }).id);
  redirect(home);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

/**
 * In-memory rate limiter. Per-instance (resets on cold start / across
 * serverless instances), but enough to blunt brute-force attempts.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_RESET_REQUESTS = 3; // per phone per window
const MAX_CODE_ATTEMPTS = 5; // verification tries per phone per window
const resetRequests = new Map<string, number[]>();
const codeAttempts = new Map<string, number[]>();

function tooMany(key: string, map: Map<string, number[]>, max: number): boolean {
  const now = Date.now();
  const hits = (map.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= max) {
    map.set(key, hits);
    return true;
  }
  hits.push(now);
  map.set(key, hits);
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function requestResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!isValidPhone(phone)) return { error: "phone" };
  if (tooMany(phone, resetRequests, MAX_RESET_REQUESTS)) {
    return { error: "rate" };
  }

  const { data: row } = await supabase
    .from("users")
    .select("id")
    .in("phone", phoneVariants(phone))
    .limit(1)
    .maybeSingle();

  // Always respond success to avoid leaking which numbers exist.
  if (row) {
    const code = String(randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase
      .from("users")
      .update({ reset_code: code, reset_expires: expires })
      .eq("id", (row as { id: string }).id);
    const sent = await sendSms(toE164(phone), resetCodeMessage(code));
    if (!sent.ok) {
      // SMS not configured or the gateway refused. The code is NEVER returned
      // to the client — log it server-side for local development only, so
      // support can pass it on when a customer calls.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[reset] SMS not delivered (${sent.provider || "unconfigured"}). Code for ${phone}: ${code}`
        );
      }
    }
  }
  return { error: undefined } as FormState;
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!isValidPhone(phone)) return { error: "phone" };
  if (password.length < 6) return { error: "password" };
  if (tooMany(phone, codeAttempts, MAX_CODE_ATTEMPTS)) {
    return { error: "invalidCode" };
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, reset_code, reset_expires")
    .in("phone", phoneVariants(phone))
    .limit(1)
    .maybeSingle();
  if (!row) return { error: "invalidCode" };
  const r = row as { reset_code: string | null; reset_expires: string | null };
  if (!r.reset_code || !safeEqual(r.reset_code, code)) {
    return { error: "invalidCode" };
  }
  if (!r.reset_expires || new Date(r.reset_expires).getTime() < Date.now()) {
    return { error: "invalidCode" };
  }
  await supabase
    .from("users")
    .update({
      password_hash: hashPassword(password),
      reset_code: null,
      reset_expires: null,
    })
    .eq("id", (row as { id: string }).id);
  return { error: undefined } as FormState;
}

/* ------------------------- memorials -------------------------- */

export type MemorialDraft = {
  name: string;
  gender: "" | "male" | "female";
  birth_year: string;
  death_year: string;
  age: string;
  city: string;
  country: string;
};

export async function createMemorialAction(
  input: MemorialDraft
): Promise<{ id: string; slug: string } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "auth" };
  if (!input.name.trim()) return { error: "name" };

  const id = newId();
  const slug = slugify(input.name);
  const { error } = await supabase.from("memorials").insert({
    id,
    user_id: user.id,
    slug,
    status: "draft",
    name: input.name.trim(),
    gender: input.gender,
    birth_year: input.birth_year,
    death_year: input.death_year,
    age: input.age,
    city: input.city,
    country: input.country,
    created_at: new Date().toISOString(),
  });
  if (error) return { error: "error" };
  return { id, slug };
}

const UPDATABLE = [
  "name",
  "gender",
  "birth_year",
  "death_year",
  "age",
  "city",
  "country",
  "school",
  "university",
  "job",
  "marital",
  "children",
  "hobbies",
  "achievements",
  "quote",
  "memories",
  "story",
  "story_lang",
] as const;

export async function updateMemorialAction(
  id: string,
  patch: Partial<Record<(typeof UPDATABLE)[number], string>>
): Promise<{ ok: true } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "auth" };
  if (!(await getMemorial(id, user.id))) return { error: "auth" };

  const keys = UPDATABLE.filter((k) => k in patch);
  if (keys.length === 0) return { ok: true };
  const update: Record<string, string> = {};
  for (const k of keys) update[k] = patch[k] ?? "";
  const { error } = await supabase.from("memorials").update(update).eq("id", id);
  if (error) return { error: "error" };
  return { ok: true };
}

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB

/** Where each kind of media is stored. */
export type UploadBackend = "supabase" | "s3";

/**
 * Photos stay on Supabase (browser-compressed to WebP first, well under the
 * free-plan 50 MB cap). Videos go to S3-compatible storage (Backblaze B2
 * private bucket — no credit card required) when configured: 10 GB free,
 * so long videos are fine.
 */
function backendFor(kind: "photos" | "videos"): UploadBackend {
  return kind === "videos" && s3Configured() ? "s3" : "supabase";
}

async function ensureBucket() {
  await supabase.storage
    .createBucket("uploads", { public: true, fileSizeLimit: "100MB" })
    .catch(() => {});
}

/**
 * Mints a signed upload URL so the browser sends the file **directly** to
 * storage (Supabase or S3/B2). This bypasses the serverless request body limit
 * (~4.5 MB on Vercel), which used to make the advertised 100 MB uploads
 * impossible. The path, extension and size are validated here before any
 * URL is issued.
 */
export async function createUploadUrlAction(
  id: string,
  kind: "photos" | "videos",
  contentType: string,
  size: number
): Promise<
  | { path: string; signedUrl: string; backend: UploadBackend }
  | { error: string }
> {
  const user = await getSession();
  if (!user) return { error: "auth" };
  if (!(await getMemorial(id, user.id))) return { error: "auth" };

  const extMap = kind === "photos" ? IMAGE_EXT : VIDEO_EXT;
  const ext = extMap[contentType];
  if (!ext) return { error: "type" };
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD) {
    return { error: "size" };
  }

  const name = `${kind === "photos" ? "p" : "v"}-${randomBytes(9).toString("hex")}.${ext}`;
  const path = `${id}/${name}`;
  const backend = backendFor(kind);

  if (backend === "s3") {
    return {
      path,
      signedUrl: s3SignedUrl("PUT", path, 3600, contentType),
      backend,
    };
  }

  await ensureBucket();
  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl) return { error: "upload" };
  return { path: data.path, signedUrl: data.signedUrl, backend };
}

/** Converts a stored object path to its public URL for the given backend. */
async function publicUrlFor(
  backend: UploadBackend,
  path: string
): Promise<string | null> {
  if (backend === "s3") {
    // Private bucket: verify with a presigned HEAD, store the canonical
    // (unsigned) URL — playback URLs are minted per render by the page.
    return (await s3Exists(path)) ? s3CanonicalUrl(path) : null;
  }
  const slash = path.indexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data: existing } = await supabase.storage
    .from("uploads")
    .list(folder, { limit: 1000 });
  const found = (existing ?? []).some((f) => f.name === name);
  if (!found) return null;
  return supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
}

/**
 * Called after the client finished uploading directly to storage. Verifies the
 * files really exist, then records their public URLs.
 */
export async function finalizeUploadAction(
  id: string,
  kind: "photos" | "videos",
  uploads: { path: string; backend: UploadBackend }[]
): Promise<{ urls: string[]; error?: string }> {
  const user = await getSession();
  if (!user) return { urls: [], error: "auth" };
  const memorial = await getMemorial(id, user.id);
  if (!memorial) return { urls: [], error: "auth" };
  if (!Array.isArray(uploads) || uploads.length === 0) {
    return { urls: [], error: "empty" };
  }

  // Only accept objects that actually exist and belong to this memorial.
  const urls: string[] = [];
  for (const u of uploads) {
    if (!u || typeof u.path !== "string" || !u.path.startsWith(`${id}/`)) {
      continue;
    }
    if (u.backend !== "supabase" && u.backend !== "s3") continue;
    const url = await publicUrlFor(u.backend, u.path);
    if (url) urls.push(url);
  }
  if (urls.length === 0) return { urls: [], error: "empty" };

  const current = parseList(memorial[kind]);
  const merged = [...current, ...urls.filter((u) => !current.includes(u))];
  await supabase.from("memorials").update({ [kind]: JSON.stringify(merged) }).eq("id", id);
  return { urls: merged };
}

export async function removeMediaAction(
  id: string,
  kind: "photos" | "videos",
  url: string
): Promise<{ urls: string[]; error?: string }> {
  const user = await getSession();
  if (!user) return { urls: [], error: "auth" };
  const memorial = await getMemorial(id, user.id);
  if (!memorial) return { urls: [], error: "auth" };
  const current = parseList(memorial[kind]).filter((u) => u !== url);
  await supabase.from("memorials").update({ [kind]: JSON.stringify(current) }).eq("id", id);

  // Best-effort removal of the underlying object (public URLs embed the path).
  try {
    const base = supabase.storage.from("uploads").getPublicUrl("").data.publicUrl;
    if (url.startsWith(base)) {
      const path = url.slice(base.length);
      if (path.startsWith(`${id}/`)) {
        await supabase.storage.from("uploads").remove([path]);
      }
    } else {
      const s3Key = s3KeyFromUrl(url);
      if (s3Key?.startsWith(`${id}/`)) await s3Delete(s3Key);
    }
  } catch {
    // orphan objects cost nothing; never fail the UI over cleanup
  }

  return { urls: current };
}

export async function generateStoryAction(
  id: string,
  lang: Locale
): Promise<StoryResult | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "auth" };
  const memorial = await getMemorial(id, user.id);
  if (!memorial) return { error: "auth" };
  if (!hasLocale(lang)) return { error: "lang" };

  // Cap AI generations per user (pollinations is free but still worth capping).
  if (hit(`ai:${user.id}`, 20)) return { error: "rate" };

  const result = await generateStory(memorial, lang);
  await supabase
    .from("memorials")
    .update({
      story: result.story,
      story_lang: lang,
      // Regenerating the story of a page that is already ordered must not
      // push it back to "ready" — that hides the public page (404) for
      // everyone but the owner.
      status: memorial.status === "published" ? "published" : "ready",
    })
    .eq("id", id);
  return result;
}

/* --------------------------- orders --------------------------- */

export type CheckoutInput = {
  memorial_id: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  payment_method: PaymentMethod;
  card_number?: string;
  card_holder?: string;
  card_expiry?: string;
  card_cvv?: string;
};

export async function placeOrderAction(
  input: CheckoutInput
): Promise<{ orderId: string; slug: string } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "auth" };

  const memorial = await getMemorial(input.memorial_id, user.id);
  if (!memorial) return { error: "auth" };
  if (!input.contact_name.trim() || !input.phone.trim() || !input.address.trim()) {
    return { error: "required" };
  }

  const allowed = paymentMethods(input.country);
  if (!allowed.includes(input.payment_method)) return { error: "method" };

  if (input.payment_method !== "cash") {
    const digits = (input.card_number ?? "").replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(digits)) return { error: "card" };
    if (!input.card_holder?.trim()) return { error: "card" };
    if (!/^\d{2}\/\d{2}$/.test(input.card_expiry ?? "")) return { error: "card" };
    if (!/^\d{3,4}$/.test(input.card_cvv ?? "")) return { error: "card" };
  }

  const { amount, currency } = priceFor(input.country);
  const id = newId();
  const { error } = await supabase.from("orders").insert({
    id,
    memorial_id: memorial.id,
    user_id: user.id,
    contact_name: input.contact_name.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    country: input.country,
    payment_method: input.payment_method,
    amount,
    currency,
    status: input.payment_method === "cash" ? "pending" : "paid",
    created_at: new Date().toISOString(),
  });
  if (error) return { error: "error" };
  await supabase.from("memorials").update({ status: "published" }).eq("id", memorial.id);
  // The dashboard route is "/[lang]/dashboard" — a literal "/dashboard" path
  // matches nothing and would silently skip the revalidation.
  revalidatePath("/[lang]/dashboard", "page");
  return { orderId: id, slug: memorial.slug };
}

const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];

export async function adminLoginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const key = String(formData.get("key") ?? "");
  // Cap admin key attempts per IP to blunt brute-force.
  if (hit(`admin:ip:${await clientIp()}`, 10)) return { error: "rate" };
  if (!verifyAdminKey(key)) return { error: "key" };
  await createAdminSession();
  return null;
}

export async function adminLogoutAction(lang?: string): Promise<void> {
  await destroyAdminSession();
  const target = hasLocale(lang ?? "") ? lang! : "ar";
  redirect(`/${target}/admin`);
}

/**
 * Updates an order's status. Authorization comes from the signed admin
 * cookie — the key itself is never sent from the client.
 */
export async function adminSetOrderStatusAction(
  orderId: string,
  status: Order["status"]
): Promise<{ ok: true } | { error: string }> {
  if (!ORDER_STATUSES.includes(status)) return { error: "status" };
  if (!(await isAdmin())) return { error: "auth" };
  await supabase.from("orders").update({ status }).eq("id", orderId);
  revalidatePath("/[lang]/admin", "page");
  return { ok: true };
}
