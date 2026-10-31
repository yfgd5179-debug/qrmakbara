import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";
import { supabase, parseList } from "@/lib/db";
import { playbackUrl } from "@/lib/s3";
import type { Memorial } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const dict = getDict(lang);
  const { data: row } = await supabase
    .from("memorials")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  if (!(row as { name?: string } | null)?.name) return {};
  const name = (row as { name: string }).name;
  return {
    title: `${name} — ${dict.meta.title}`,
    description: dict.meta.description,
    openGraph: {
      title: `${name} — ${dict.meta.title}`,
      description: dict.meta.description,
      type: "profile",
    },
  };
}

export default async function MemorialPage({
  params,
}: PageProps<"/[lang]/m/[slug]">) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDict(lang);

  const { data: memorialRaw } = await supabase
    .from("memorials")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  const memorial = memorialRaw as unknown as Memorial | undefined;
  if (!memorial) notFound();

  const user = await getSession();
  const isOwner = !!user && user.id === memorial.user_id;
  if (memorial.status !== "published" && !isOwner) notFound();

  const t = dict.memorial;
  const photos = parseList(memorial.photos);
  // S3/B2 videos are stored in a private bucket: mint a short-lived presigned
  // GET URL on every render. Supabase (and public-CDN) URLs pass through.
  const videos = parseList(memorial.videos).map(playbackUrl);
  // Guard against a null/undefined story (column may be missing on old rows).
  const paragraphs = (memorial.story ?? "")
    .split(/\n{2,}/)
    .filter((p) => p.trim());

  const lifespan =
    memorial.birth_year || memorial.death_year
      ? dict.memorial.lifespan
          .replace("{birth}", memorial.birth_year || "?")
          .replace("{death}", memorial.death_year || "?")
      : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="text-center">
        <div
          aria-hidden
          className="mx-auto mb-6 h-px w-24 bg-gradient-to-r from-transparent via-gold to-transparent"
        />
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {memorial.name}
        </h1>
        {lifespan && (
          <p className="mt-3 text-lg text-gold" dir="ltr">
            {lifespan}
          </p>
        )}
        {(memorial.city || memorial.country) && (
          <p className="mt-1 text-slate-400">
            {[memorial.city, memorial.country]
              .filter(Boolean)
              .join(lang === "ar" || lang === "ku" ? "، " : ", ")}
          </p>
        )}
        <div
          aria-hidden
          className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-gold to-transparent"
        />
      </header>

      {(memorial.school ||
        memorial.university ||
        memorial.job ||
        memorial.children) && (
        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          {memorial.school && (
            <Fact label={dict.wizard.school} value={memorial.school} />
          )}
          {memorial.university && (
            <Fact label={dict.wizard.university} value={memorial.university} />
          )}
          {memorial.job && (
            <Fact label={dict.wizard.job} value={memorial.job} />
          )}
          {memorial.children && (
            <Fact label={dict.wizard.children} value={memorial.children} />
          )}
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-center text-2xl font-bold text-white">
          {t.storyTitle}
        </h2>
        {paragraphs.length > 0 ? (
          <div className="mx-auto mt-6 max-w-2xl space-y-5 text-[17px] leading-loose text-slate-300">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-center text-slate-500">{t.noStory}</p>
        )}

        {memorial.quote && (
          <blockquote className="mx-auto mt-8 max-w-xl border-s-4 border-gold bg-slate-900/60 p-5 text-center text-lg italic text-slate-200">
            {memorial.quote}
          </blockquote>
        )}
      </section>

      {photos.length > 0 && (
        <section className="mt-12">
          <h2 className="text-center text-2xl font-bold text-white">
            {t.gallery}
          </h2>
          <div className="mt-6">
            <Gallery
              photos={photos}
              alt={memorial.name}
              closeLabel={dict.common.close}
              prevLabel={dict.common.back}
              nextLabel={dict.common.next}
            />
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="mt-12">
          <h2 className="text-center text-2xl font-bold text-white">
            {t.videos}
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {videos.map((src) => (
              <video
                key={src}
                src={src}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-xl border border-slate-700 bg-black"
              />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-16 text-center text-sm text-slate-500">
        <p>{t.scanHint}</p>
        <p className="mt-1">
          {t.madeWith} —{" "}
          <span className="text-gold">QR Makbara</span>
        </p>
      </footer>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-end font-medium text-slate-200">{value}</span>
    </div>
  );
}
