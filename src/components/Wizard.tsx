"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createMemorialAction,
  createUploadUrlAction,
  finalizeUploadAction,
  generateStoryAction,
  placeOrderAction,
  removeMediaAction,
  updateMemorialAction,
} from "@/lib/actions";
import {
  formatPrice,
  paymentMethods,
  priceFor,
  type PaymentMethod,
} from "@/lib/commerce";
import { COUNTRY_CODES, type Dict } from "@/lib/dict";
import { compressImage } from "@/lib/compress";
import { MetalPlaque } from "@/components/MetalPlaque";
import { LOCALES, type Locale, type Memorial } from "@/lib/types";

/** Local JSON-array parser — avoids importing the server-only db module. */
function parseJsonList(json: string | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

type Props = {
  lang: Locale;
  dict: Dict;
  user: { name: string; phone: string; country: string };
  /** Existing memorial to continue editing (from /create?edit=<id>). */
  initial?: Memorial | null;
};

const STEPS = 5;

/**
 * Age at death is derived from the two years — the wizard never asks for it,
 * so there is only one source of truth and no way to enter 70 with 1934–2005.
 */
function ageFromYears(birth: string, death: string): string {
  const b = parseInt(birth, 10);
  const d = parseInt(death, 10);
  if (!b || !d || d < b) return "";
  return String(d - b);
}

export function Wizard({ lang, dict, user, initial }: Props) {
  const router = useRouter();
  const w = dict.wizard;
  const c = dict.common;

  const [step, setStep] = useState(0);
  // Seed with the existing record so "Manage" continues it instead of
  // creating a duplicate on the next press of Next.
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  // Slug backs the QR code on the metal plaque preview (step 5).
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // step 0 — the person
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<string>(initial?.gender ?? "");
  const [birthYear, setBirthYear] = useState(initial?.birth_year ?? "");
  const [deathYear, setDeathYear] = useState(initial?.death_year ?? "");
  const age = ageFromYears(birthYear, deathYear);
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country || user.country || "IQ");

  // step 1 — their life
  const [life, setLife] = useState<Record<string, string>>({
    school: initial?.school ?? "",
    university: initial?.university ?? "",
    job: initial?.job ?? "",
    marital: initial?.marital ?? "",
    children: initial?.children ?? "",
    hobbies: initial?.hobbies ?? "",
    achievements: initial?.achievements ?? "",
    quote: initial?.quote ?? "",
    memories: initial?.memories ?? "",
  });

  // step 2 — media
  const [photos, setPhotos] = useState<string[]>(() =>
    parseJsonList(initial?.photos)
  );
  const [videos, setVideos] = useState<string[]>(() =>
    parseJsonList(initial?.videos)
  );
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // step 3 — story
  const [storyLang, setStoryLang] = useState<Locale>(
    (initial?.story_lang as Locale) || lang
  );
  const [story, setStory] = useState(initial?.story ?? "");
  const [provider, setProvider] = useState("");

  // step 4 — checkout
  const [contact, setContact] = useState({
    contact_name: user.name,
    phone: user.phone,
    address: "",
    city: "",
    country: user.country || "IQ",
  });
  const [payMethod, setPayMethod] = useState<PaymentMethod>(
    paymentMethods(user.country || "IQ")[0]
  );
  const [card, setCard] = useState({
    card_number: "",
    card_holder: "",
    card_expiry: "",
    card_cvv: "",
  });

  const methods = paymentMethods(contact.country);
  const price = priceFor(contact.country);

  function fail(code: string) {
    const map: Record<string, string> = {
      auth: dict.auth.loginRequired,
      name: c.required,
      required: c.required,
      method: w.errMethod,
      card: w.errCard,
      empty: w.errUpload,
      upload: w.errUpload,
      type: w.errUploadType,
      size: w.errUploadSize,
      lang: c.error,
      rate: dict.auth.rateLimit,
    };
    setError(map[code] ?? c.error);
  }

  async function nextFromPerson() {
    setError(null);
    if (!name.trim()) return fail("name");
    setBusy(true);
    try {
      // If we already created the record (user went back and forth between
      // steps), update it instead of inserting a duplicate memorial.
      if (id) {
        const res = await updateMemorialAction(id, {
          name: name.trim(),
          gender: gender as "" | "male" | "female",
          birth_year: birthYear,
          death_year: deathYear,
          age,
          city,
          country,
        });
        if ("error" in res) return fail(res.error);
      } else {
        const res = await createMemorialAction({
          name: name.trim(),
          gender: gender as "" | "male" | "female",
          birth_year: birthYear,
          death_year: deathYear,
          age,
          city,
          country,
        });
        if ("error" in res) return fail(res.error);
        setId(res.id);
        setSlug(res.slug);
        // Keep the draft id in the URL (no navigation, just the address bar)
        // so a reload or a language switch resumes this memorial instead of
        // silently starting a second, duplicate one.
        window.history.replaceState(
          null,
          "",
          `/${lang}/create?edit=${res.id}`
        );
      }
      setStep(1);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function nextFromLife() {
    setError(null);
    if (!id) return;
    setBusy(true);
    try {
      const res = await updateMemorialAction(id, {
        ...life,
        age,
      });
      if ("error" in res) return fail(res.error);
      setStep(2);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(kind: "photos" | "videos", files: FileList | null) {
    if (!files || files.length === 0 || !id) return;
    setError(null);
    setUploading(true);
    try {
      const list = Array.from(files);
      const maxExt = kind === "photos" ? "image/" : "video/";

      // Photos are compressed in the browser first (WebP, ≤2048px) — this
      // keeps them far below the Supabase free-plan 50 MB/file cap.
      const prepared =
        kind === "photos"
          ? await Promise.all(list.map((f) => compressImage(f)))
          : list;

      for (const f of prepared) {
        // Fast local checks before asking the server for upload URLs.
        if (!f.type.startsWith(maxExt)) return fail("type");
        if (f.size > 100 * 1024 * 1024) return fail("size");
      }

      const uploads: { path: string; backend: "supabase" | "s3" }[] = [];

      // Records whatever managed to upload before a failure, so a mid-batch
      // error doesn't strand already-uploaded files in storage.
      async function finishPartial() {
        if (uploads.length === 0) return;
        const res = await finalizeUploadAction(id!, kind, uploads);
        if (!res.error) {
          if (kind === "photos") setPhotos(res.urls);
          else setVideos(res.urls);
        }
      }

      for (const f of prepared) {
        // 1) Server validates ownership/type/size and mints a signed URL.
        const ticket = await createUploadUrlAction(id, kind, f.type, f.size);
        if ("error" in ticket) {
          await finishPartial();
          return fail(ticket.error);
        }

        // 2) Browser uploads the file straight to storage (Supabase for
        //    photos, Backblaze B2 for videos) — the request never passes
        //    through the (4.5 MB-limited) server.
        const put = await fetch(ticket.signedUrl, {
          method: "PUT",
          headers: { "content-type": f.type },
          body: f,
        });
        if (!put.ok) {
          await finishPartial();
          return fail("upload");
        }
        uploads.push({ path: ticket.path, backend: ticket.backend });
      }

      // 3) Server verifies the files exist and records their public URLs.
      const res = await finalizeUploadAction(id, kind, uploads);
      if (res.error) return fail(res.error);
      if (kind === "photos") setPhotos(res.urls);
      else setVideos(res.urls);
    } finally {
      setUploading(false);
      if (kind === "photos" && photoInput.current) photoInput.current.value = "";
      if (kind === "videos" && videoInput.current) videoInput.current.value = "";
    }
  }

  async function handleRemove(kind: "photos" | "videos", url: string) {
    if (!id) return;
    const res = await removeMediaAction(id, kind, url);
    if (kind === "photos") setPhotos(res.urls);
    else setVideos(res.urls);
  }

  async function writeStory() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const res = await generateStoryAction(id, storyLang);
      if ("error" in res) return fail(res.error);
      setStory(res.story);
      setProvider(res.provider);
    } finally {
      setBusy(false);
    }
  }

  async function nextFromStory() {
    setError(null);
    if (!id) return;
    if (!story.trim()) return fail("required");
    setBusy(true);
    try {
      const res = await updateMemorialAction(id, {
        story: story.trim(),
        story_lang: storyLang,
      });
      if ("error" in res) return fail(res.error);
      setStep(4);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder() {
    setError(null);
    if (!id) return;
    setBusy(true);
    try {
      const res = await placeOrderAction({
        memorial_id: id,
        ...contact,
        payment_method: payMethod,
        ...card,
      });
      if ("error" in res) return fail(res.error);
      router.push(`/${lang}/order/${res.orderId}`);
    } finally {
      setBusy(false);
    }
  }

  const stepTitles = [w.s1Title, w.s2Title, w.s3Title, w.s4Title, w.s5Title];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-white">
        {w.createTitle}
      </h1>

      {/* Progress */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {stepTitles.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                i <= step
                  ? "bg-gold text-slate-950"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS - 1 && (
              <div
                className={`h-px w-6 sm:w-10 ${i < step ? "bg-gold" : "bg-slate-700"}`}
              />
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-sm text-slate-400">
        {w.progress
          .replace("{current}", String(step + 1))
          .replace("{total}", String(STEPS))}
        {" — "}
        <span className="text-slate-300">{stepTitles[step]}</span>
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="card mt-6 p-6 sm:p-8">
        {/* ---------------- Step 1: the person ---------------- */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">{w.s1Title}</h2>
            <p className="text-sm text-slate-400">{w.s1Text}</p>

            <div>
              <label className="label">{w.name} *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{w.gender}</label>
                <select
                  className="input"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="male">{w.male}</option>
                  <option value="female">{w.female}</option>
                </select>
              </div>
              <div>
                <label className="label">{w.birthYear}</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="1950"
                />
              </div>
              <div>
                <label className="label">{w.deathYear}</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={deathYear}
                  onChange={(e) => setDeathYear(e.target.value)}
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="label">{w.city}</label>
                <input
                  className="input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{w.country}</label>
                <select
                  className="input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {dict.countries[code]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Age is never asked: it follows from the two years above. */}
            {age && (
              <p className="text-sm text-slate-400">
                {w.age}: <span className="font-semibold text-slate-200">{age}</span>
              </p>
            )}

            <div className="pt-2 text-end">
              <button
                onClick={nextFromPerson}
                disabled={busy}
                className="btn-gold"
              >
                {busy ? c.loading : c.next}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 2: their life ---------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">{w.s2Title}</h2>
            <p className="text-sm text-slate-400">{w.s2Text}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{w.school}</label>
                <input
                  className="input"
                  value={life.school}
                  onChange={(e) => setLife({ ...life, school: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{w.university}</label>
                <input
                  className="input"
                  value={life.university}
                  onChange={(e) =>
                    setLife({ ...life, university: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">{w.job}</label>
                <input
                  className="input"
                  value={life.job}
                  onChange={(e) => setLife({ ...life, job: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{w.marital}</label>
                <select
                  className="input"
                  value={life.marital}
                  onChange={(e) => setLife({ ...life, marital: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="single">{w.single}</option>
                  <option value="married">{w.married}</option>
                  <option value="widowed">{w.widowed}</option>
                </select>
              </div>
              <div>
                <label className="label">{w.children}</label>
                <input
                  className="input"
                  value={life.children}
                  onChange={(e) => setLife({ ...life, children: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{w.hobbies}</label>
                <input
                  className="input"
                  value={life.hobbies}
                  onChange={(e) => setLife({ ...life, hobbies: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">{w.achievements}</label>
              <input
                className="input"
                value={life.achievements}
                onChange={(e) =>
                  setLife({ ...life, achievements: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">{w.quote}</label>
              <input
                className="input"
                value={life.quote}
                onChange={(e) => setLife({ ...life, quote: e.target.value })}
              />
            </div>

            <div>
              <label className="label">{w.memories}</label>
              <textarea
                className="input min-h-32"
                value={life.memories}
                onChange={(e) => setLife({ ...life, memories: e.target.value })}
                placeholder={w.memoriesHint}
              />
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(0)}
                className="rounded-lg border border-slate-600 px-5 py-2.5 text-slate-200 hover:border-slate-400"
              >
                {c.back}
              </button>
              <button onClick={nextFromLife} disabled={busy} className="btn-gold">
                {busy ? c.loading : c.next}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 3: photos & videos ---------------- */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">{w.s3Title}</h2>
            <p className="text-sm text-slate-400">{w.s3Text}</p>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label !mb-0">{w.photos}</span>
                <span className="text-xs text-slate-500">{w.uploadHint}</span>
              </div>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm text-slate-400 file:me-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-slate-200"
                onChange={(e) => handleUpload("photos", e.target.files)}
                disabled={!id || uploading}
              />
              {photos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{w.noPhotos}</p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((src) => (
                    <div
                      key={src}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => handleRemove("photos", src)}
                        aria-label={c.cancel}
                        className="absolute end-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="label">{w.videos}</span>
              <input
                ref={videoInput}
                type="file"
                accept="video/*"
                multiple
                className="block w-full text-sm text-slate-400 file:me-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-slate-200"
                onChange={(e) => handleUpload("videos", e.target.files)}
                disabled={!id || uploading}
              />
              {videos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{w.noVideos}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {videos.map((src) => (
                    <li
                      key={src}
                      className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-sm"
                    >
                      <span dir="ltr" className="truncate text-slate-400">
                        {src.split("/").pop()}
                      </span>
                      <button
                        onClick={() => handleRemove("videos", src)}
                        className="text-red-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {uploading && (
              <p className="text-sm text-gold">{w.uploading}</p>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-600 px-5 py-2.5 text-slate-200 hover:border-slate-400"
              >
                {c.back}
              </button>
              <button
                onClick={() => {
                  setStep(3);
                  window.scrollTo({ top: 0 });
                }}
                disabled={busy || uploading}
                className="btn-gold"
              >
                {uploading ? w.uploading : c.next}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 4: the story ---------------- */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">{w.s4Title}</h2>
            <p className="text-sm text-slate-400">{w.s4Text}</p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">{w.storyLang}</label>
                <select
                  className="input !w-48"
                  value={storyLang}
                  onChange={(e) => setStoryLang(e.target.value as Locale)}
                >
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {dict.langNames[l]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={writeStory}
                disabled={busy || !id}
                className="btn-gold"
              >
                {busy ? w.generating : story ? w.regenerate : w.generate}
              </button>
            </div>

            <textarea
              className="input min-h-56 leading-relaxed"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder={w.storyHint}
            />

            {provider && (
              <p className="text-xs text-slate-500">
                {w.aiNote} — {w.provider}: <span dir="ltr">{provider}</span>
              </p>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-slate-600 px-5 py-2.5 text-slate-200 hover:border-slate-400"
              >
                {c.back}
              </button>
              <button onClick={nextFromStory} disabled={busy} className="btn-gold">
                {busy ? c.loading : c.next}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 5: delivery & payment ---------------- */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">{w.s5Title}</h2>
            <p className="text-sm text-slate-400">{w.s5Text}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{w.contactName} *</label>
                <input
                  className="input"
                  value={contact.contact_name}
                  onChange={(e) =>
                    setContact({ ...contact, contact_name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">{w.phone} *</label>
                <input
                  className="input"
                  dir="ltr"
                  value={contact.phone}
                  onChange={(e) =>
                    setContact({ ...contact, phone: e.target.value })
                  }
                  placeholder="+964 ..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{w.address} *</label>
                <input
                  className="input"
                  value={contact.address}
                  onChange={(e) =>
                    setContact({ ...contact, address: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">{w.city}</label>
                <input
                  className="input"
                  value={contact.city}
                  onChange={(e) => setContact({ ...contact, city: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{w.country}</label>
                <select
                  className="input"
                  value={contact.country}
                  onChange={(e) => {
                    const next = e.target.value;
                    const allowed = paymentMethods(next);
                    setContact({ ...contact, country: next });
                    if (!allowed.includes(payMethod)) setPayMethod(allowed[0]);
                  }}
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {dict.countries[code]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Payment methods */}
            <div>
              <label className="label">{w.payment} *</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                      payMethod === m
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {m === "cash" ? w.cash : m === "card" ? w.card : w.online}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {payMethod === "cash" ? w.cashNote : w.onlineNote}
              </p>
            </div>

            {payMethod !== "cash" && (
              <div className="grid gap-4 rounded-xl border border-slate-700 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">{w.cardNumber}</label>
                  <input
                    className="input"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="4242 4242 4242 4242"
                    value={card.card_number}
                    onChange={(e) =>
                      setCard({ ...card, card_number: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{w.cardHolder}</label>
                  <input
                    className="input"
                    dir="ltr"
                    value={card.card_holder}
                    onChange={(e) =>
                      setCard({ ...card, card_holder: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">{w.expiry}</label>
                  <input
                    className="input"
                    dir="ltr"
                    placeholder="12/28"
                    value={card.card_expiry}
                    onChange={(e) =>
                      setCard({ ...card, card_expiry: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">{w.cvv}</label>
                  <input
                    className="input"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="123"
                    value={card.card_cvv}
                    onChange={(e) =>
                      setCard({ ...card, card_cvv: e.target.value })
                    }
                  />
                </div>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {w.cardDemo}
                </p>
              </div>
            )}

            {/* The physical plaque the order produces — same artwork as the
                prints, so buyers see exactly what gets engraved. */}
            {slug && (
              <MetalPlaque
                path={`/m/${slug}`}
                name={name}
                birthYear={birthYear}
                deathYear={deathYear}
                gender={gender}
                lang={lang}
                labels={{
                  title: dict.order.qrTitle,
                  text: dict.order.qrText,
                  png: dict.order.downloadPng,
                  svg: dict.order.downloadSvg,
                  copy: dict.order.copyLink,
                  copied: c.copied,
                  error: dict.order.qrError,
                }}
              />
            )}

            <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
              <span className="font-semibold text-slate-200">{w.total}</span>
              <span className="text-lg font-extrabold text-gold">
                {formatPrice(price.amount, price.currency)}
              </span>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(3)}
                className="rounded-lg border border-slate-600 px-5 py-2.5 text-slate-200 hover:border-slate-400"
              >
                {c.back}
              </button>
              <button
                onClick={submitOrder}
                disabled={busy}
                className="btn-gold"
              >
                {busy ? w.placing : w.pay}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
