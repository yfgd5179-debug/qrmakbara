"use server";

import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
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
import { canonicalPhone, isValidPhone, phoneDigits, phoneVariants } from "./phone";
import { hit, clientIp } from "./ratelimit";
import {
  RESET_OK_COOKIE,
  RESET_PHONE_COOKIE,
  resetCookieOptions,
  resetOkToken,
} from "./reset";
import { s3CanonicalUrl, s3Configured, s3Delete, s3Exists, s3KeyFromUrl, s3SignedUrl } from "./s3";
import { resetCodeMessage, sendSms } from "./sms";
import type { Locale, Memorial, Order, StoryResult } from "./types";

export type FormState = { error?: string; ok?: boolean } | null;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tail = randomBytes(3).toString("hex");
  return `${base || "memorial"}-${tail}`;
}

async function getMemorial(
  id: string,
  userId: string
): Promise<Memorial | null> {
  const { data: row } = await supabase
    .from("memorials")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row || (row as Memorial).user_id !== userId) return null;
  return row as Memorial;
}

/* ---------------------------- auth ---------------------------- */

/**
 * Finds a user by phone number, however it was typed. Every candidate is a
 * parameterised `.eq()` lookup (supabase-js URL-encodes the value), so user
 * input never reaches a PostgREST filter string.
 */
async function findUserByPhone(
  raw: string
): Promise<Record<string, unknown> | null> {
  const results = await Promise.all(
    phoneVariants(raw).map((variant) =>
      supabase
        .from("users")
        .select("*")
        .eq("phone", variant)
        .limit(1)
        .maybeSingle()
    )
  );
  for (const result of results) {
    if (result.data) return result.data as Record<string, unknown>;
  }
  return null;
}

/**
 * `users.email` used to be `not null` from the e-mail sign-in days. Try NULL
 * first — the correct value once the column is made nullable — and fall back to
 * a synthetic address derived from the phone number so registration keeps
 * working without a manual migration.
 */
let emailColumnNullable: boolean | null = null;

async function insertUser(row: Record<string, unknown>): Promise<string | undefined> {
  if (emailColumnNullable !== false) {
    const { error } = await supabase.from("users").insert({ ...row, email: null });
    if (!error) {
      emailColumnNullable = true;
      return undefined;
    }
    emailColumnNullable = false;
  }

  const { error } = await supabase.from("users").insert({
    ...row,
    email: `${phoneDigits(String(row.phone))}@phone.invalid`,
  });
  if (!error) return undefined;
  // 23505 = unique_violation (the same number was registered at the same time).
  return error.code === "23505" ? "exists" : "failed";
}

export async function registerAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "IQ");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  if (!isValidPhone(phone)) return { error: "phone" };
  if (password.length < 6) return { error: "password" };
  if (!name) return { error: "name" };

  // Cap sign-ups per IP to slow bulk account creation.
  if (hit(`register:ip:${await clientIp()}`, 10)) return { error: "rate" };

  // The phone number is the account identifier — it must be unique.
  if (await findUserByPhone(phone)) return { error: "exists" };

  const id = newId();
  const failure = await insertUser({
    id,
    password_hash: hashPassword(password),
    name,
    phone: canonicalPhone(phone),
    country,
    created_at: new Date().toISOString(),
  });
  if (failure) return { error: failure };

  await createSession(id);
  redirect(home);
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  if (!phone || !password) return { error: "invalid" };

  // Throttle brute-force: per phone+IP, plus a looser per-IP cap. No OTP is
  // asked here — verification only happens when a password is reset.
  const ip = await clientIp();
  if (
    hit(`login:phone:${canonicalPhone(phone) || phone.toLowerCase()}`, 10) ||
    hit(`login:ip:${ip}`, 30)
  ) {
    return { error: "rate" };
  }

  const row = await findUserByPhone(phone);
  if (!row || !verifyPassword(password, String(row.password_hash ?? ""))) {
    return { error: "invalid" };
  }
  await createSession(String(row.id));
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

/**
 * Generates a fresh code, stores it and sends it. Shared by the initial
 * request and the "send again" button on the code screen.
 *
 * The SMS body is ALWAYS Arabic (`resetCodeMessage`) — the app's default
 * language — so every customer receives the same wording no matter which
 * interface language they happen to be browsing in.
 */
async function issueResetCode(phone: string): Promise<FormState> {
  const key = canonicalPhone(phone);
  if (tooMany(key, resetRequests, MAX_RESET_REQUESTS)) return { error: "rate" };

  const row = await findUserByPhone(phone);
  // Always answer the same way for unknown numbers, so the form cannot be
  // used to discover which phone numbers have an account.
  if (!row) return null;

  const code = String(randomInt(100000, 1000000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase
    .from("users")
    .update({ reset_code: code, reset_expires: expires })
    .eq("id", String(row.id));

  // sendSms takes E.164 and never throws; a stored legacy number ("0770…")
  // is canonicalized here so the gateway always receives "+964…".
  const to = canonicalPhone(String(row.phone) || phone);
  const outcome = await sendSms(to, resetCodeMessage(code));
  if (!to || !outcome.ok) {
    // Gateway refused or is not configured. The code is NEVER returned to
    // the client — it is logged server-side for local development only, so
    // support can pass it on when a customer calls.
    console.warn(`[reset] SMS not sent to ${key} (${outcome.provider || "unconfigured"})`);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[reset] code for ${key}: ${code}`);
    }
    return { error: "send" };
  }
  return null;
}

/** Requested interface language, falling back to the default Arabic. */
function langOf(formData: FormData): string {
  const lang = String(formData.get("lang") ?? "ar");
  return hasLocale(lang) ? lang : "ar";
}

/**
 * Step 1 — the only place that asks for a phone number. On success the number
 * is remembered in an httpOnly cookie and the visitor is sent straight to the
 * code screen; they never type it again.
 */
export async function requestResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  if (!isValidPhone(phone)) return { error: "phone" };

  const failure = await issueResetCode(phone);
  if (failure) return failure;

  const jar = await cookies();
  jar.set(RESET_PHONE_COOKIE, canonicalPhone(phone), resetCookieOptions);
  jar.delete(RESET_OK_COOKIE);
  redirect(`/${langOf(formData)}/verify`);
}

/**
 * Step 2 — verifies the 6-digit code (the number comes from the cookie, so
 * this screen has no phone field) and, on success, mints the short-lived
 * proof the password screen requires.
 */
export async function verifyCodeAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const jar = await cookies();
  const phone = jar.get(RESET_PHONE_COOKIE)?.value ?? "";
  const lang = langOf(formData);
  if (!phone || !isValidPhone(phone)) redirect(`/${lang}/forgot?expired=1`);

  const code = String(formData.get("code") ?? "").trim();
  const key = canonicalPhone(phone);
  if (tooMany(key, codeAttempts, MAX_CODE_ATTEMPTS)) return { error: "rate" };

  const row = await findUserByPhone(phone);
  const stored = row ? String(row.reset_code ?? "") : "";
  const expiry = row?.reset_expires ? new Date(String(row.reset_expires)) : null;
  if (!stored || !safeEqual(stored, code)) return { error: "invalidCode" };
  if (!expiry || expiry.getTime() < Date.now()) return { error: "invalidCode" };

  jar.set(RESET_OK_COOKIE, resetOkToken(key), resetCookieOptions);
  redirect(`/${lang}/newpass`);
}

/** Sends a fresh code to the remembered number without leaving the code screen. */
export async function resendCodeAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const jar = await cookies();
  const phone = jar.get(RESET_PHONE_COOKIE)?.value ?? "";
  const lang = langOf(formData);
  if (!phone || !isValidPhone(phone)) redirect(`/${lang}/forgot?expired=1`);

  const failure = await issueResetCode(phone);
  if (failure) return failure;
  return { ok: true };
}

/**
 * Step 3 — sets the new password. Nothing else is asked: the number and the
 * verified-code proof both come from the httpOnly cookies.
 */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const jar = await cookies();
  const phone = jar.get(RESET_PHONE_COOKIE)?.value ?? "";
  const proof = jar.get(RESET_OK_COOKIE)?.value ?? "";
  const lang = langOf(formData);
  const key = canonicalPhone(phone);
  if (!phone || !key || !proof || !safeEqual(proof, resetOkToken(key))) {
    redirect(`/${lang}/forgot?expired=1`);
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) return { error: "password" };
  if (password !== confirm) return { error: "mismatch" };

  const row = await findUserByPhone(phone);
  if (!row) redirect(`/${lang}/forgot?expired=1`);

  await supabase
    .from("users")
    .update({
      password_hash: hashPassword(password),
      reset_code: null,
      reset_expires: null,
    })
    .eq("id", String(row.id));

  jar.delete(RESET_PHONE_COOKIE);
  jar.delete(RESET_OK_COOKIE);
  redirect(`/${lang}/login?reset=1`);
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
  // A silent failure here used to hand the wizard an id that leads to a 404.
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
  // Never report an order id the database refused to store.
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
