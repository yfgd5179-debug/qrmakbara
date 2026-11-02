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
import { hit, clientIp } from "./ratelimit";
import { s3CanonicalUrl, s3Configured, s3Delete, s3Exists, s3KeyFromUrl, s3SignedUrl } from "./s3";
import type { Locale, Memorial, Order, StoryResult } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FormState = { error?: string } | null;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tail = randomBytes(3).toString("hex");
  return `${base || "memorial"}-${tail}`;
}

async function getMemorial(id: string, userId: string): Promise<Memorial> {
  const { data: row } = await supabase
    .from("memorials")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row || (row as Memorial).user_id !== userId) throw new Error("Not found");
  return row as Memorial;
}

/* ---------------------------- auth ---------------------------- */

export async function registerAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const country = String(formData.get("country") ?? "IQ");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  if (!EMAIL_RE.test(email)) return { error: "email" };
  if (password.length < 6) return { error: "password" };
  if (!name) return { error: "name" };

  // Cap sign-ups per IP to slow bulk account creation.
  if (hit(`register:ip:${await clientIp()}`, 10)) return { error: "rate" };

  const { data: exists } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (exists) return { error: "exists" };

  const id = newId();
  await supabase.from("users").insert({
    id,
    email,
    password_hash: hashPassword(password),
    name,
    phone,
    country,
    created_at: new Date().toISOString(),
  });
  await createSession(id);
  redirect(home);
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const lang = String(formData.get("lang") ?? "ar");
  const home = hasLocale(lang) ? `/${lang}/dashboard` : "/ar/dashboard";

  if (!identifier || !password) return { error: "invalid" };

  // Throttle brute-force: per identifier+IP, plus a looser per-IP cap.
  const ip = await clientIp();
  if (
    hit(`login:id:${identifier.toLowerCase()}`, 10) ||
    hit(`login:ip:${ip}`, 30)
  ) {
    return { error: "rate" };
  }

  // Never interpolate user input into a PostgREST `.or()` filter string —
  // that is a filter-injection vector. Use two parameterized `.eq()`
  // lookups instead (supabase-js URL-encodes values safely).
  const { data: byEmail } = await supabase
    .from("users")
    .select("*")
    .eq("email", identifier.toLowerCase())
    .maybeSingle();
  let row = byEmail;
  if (!row) {
    const { data: byPhone } = await supabase
      .from("users")
      .select("*")
      .eq("phone", identifier)
      .maybeSingle();
    row = byPhone;
  }

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

async function sendResetEmail(email: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "QR Makbara <onboarding@resend.dev>",
        to: [email],
        subject: `QR Makbara — password reset code: ${code}`,
        text: `Your password reset code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
        html: `<p>Your password reset code is: <strong>${code}</strong></p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * In-memory rate limiter. Per-instance (resets on cold start / across
 * serverless instances), but enough to blunt brute-force attempts.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_RESET_REQUESTS = 3; // per email per window
const MAX_CODE_ATTEMPTS = 5; // verification tries per email per window
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "email" };
  if (tooMany(email, resetRequests, MAX_RESET_REQUESTS)) {
    return { error: "rate" };
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  // Always respond success to avoid leaking which emails exist.
  if (row) {
    const code = String(randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase
      .from("users")
      .update({ reset_code: code, reset_expires: expires })
      .eq("id", (row as { id: string }).id);
    const sent = await sendResetEmail(email, code);
    if (!sent) {
      // Email delivery is not configured. The code is NEVER returned to the
      // client — log it server-side for local development only.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[reset] RESEND_API_KEY missing/failed. Code for ${email}: ${code}`);
      }
    }
  }
  return { error: undefined } as FormState;
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "password" };
  if (tooMany(email, codeAttempts, MAX_CODE_ATTEMPTS)) {
    return { error: "invalidCode" };
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, reset_code, reset_expires")
    .eq("email", email)
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
  await supabase.from("memorials").insert({
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
  await getMemorial(id, user.id);

  const keys = UPDATABLE.filter((k) => k in patch);
  if (keys.length === 0) return { ok: true };
  const update: Record<string, string> = {};
  for (const k of keys) update[k] = patch[k] ?? "";
  await supabase.from("memorials").update(update).eq("id", id);
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
  await getMemorial(id, user.id);

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
  if (!hasLocale(lang)) return { error: "lang" };

  // Cap AI generations per user (pollinations is free but still worth capping).
  if (hit(`ai:${user.id}`, 20)) return { error: "rate" };

  const result = await generateStory(memorial, lang);
  await supabase
    .from("memorials")
    .update({ story: result.story, story_lang: lang, status: "ready" })
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
  await supabase.from("orders").insert({
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
