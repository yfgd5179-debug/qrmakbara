"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateStory } from "./ai";
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
  const { data: row } = await supabase
    .from("users")
    .select("*")
    .or(`email.eq.${identifier.toLowerCase()},phone.eq.${identifier}`)
    .maybeSingle();
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
        subject: "QR Makbara — password reset code",
        text: `Your password reset code is: ${code}\\n\\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState & { code?: string } | FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const lang = String(formData.get("lang") ?? "ar");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "email" };

  const { data: row } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  // Always respond success to avoid leaking which emails exist.
  if (row) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase
      .from("users")
      .update({ reset_code: code, reset_expires: expires })
      .eq("id", (row as { id: string }).id);
    const sent = await sendResetEmail(email, code);
    if (!sent) {
      // Dev fallback: return the code so it can be shown on screen.
      return { error: undefined, code } as FormState & { code: string };
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

  const { data: row } = await supabase
    .from("users")
    .select("id, reset_code, reset_expires")
    .eq("email", email)
    .maybeSingle();
  if (!row) return { error: "invalidCode" };
  const r = row as { reset_code: string | null; reset_expires: string | null };
  if (!r.reset_code || r.reset_code !== code) return { error: "invalidCode" };
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

async function ensureBucket() {
  await supabase.storage.createBucket("uploads", { public: true }).catch(() => {});
}

export async function uploadMediaAction(
  id: string,
  kind: "photos" | "videos",
  formData: FormData
): Promise<{ urls: string[]; error?: string }> {
  const user = await getSession();
  if (!user) return { urls: [], error: "auth" };
  const memorial = await getMemorial(id, user.id);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { urls: [], error: "empty" };

  const extMap = kind === "photos" ? IMAGE_EXT : VIDEO_EXT;
  await ensureBucket();

  const urls: string[] = [];
  for (const file of files) {
    const ext = extMap[file.type];
    if (!ext) return { urls, error: "type" };
    if (file.size > MAX_UPLOAD) return { urls, error: "size" };
    const name = `${kind === "photos" ? "p" : "v"}-${randomBytes(6).toString("hex")}.${ext}`;
    const path = `${id}/${name}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("uploads")
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (upErr) return { urls, error: "upload" };
    const { data } = supabase.storage.from("uploads").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  const current = parseList(memorial[kind]);
  const merged = [...current, ...urls];
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
  revalidatePath("/dashboard");
  return { orderId: id, slug: memorial.slug };
}

export async function adminSetOrderStatusAction(
  orderId: string,
  status: Order["status"],
  adminKey: string
): Promise<{ ok: true } | { error: string }> {
  const expected =
    process.env.ADMIN_KEY ??
    (process.env.NODE_ENV !== "production" ? "admin123" : "");
  if (adminKey !== expected || !expected) return { error: "key" };
  await supabase.from("orders").update({ status }).eq("id", orderId);
  revalidatePath("/admin");
  return { ok: true };
}
