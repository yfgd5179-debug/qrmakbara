import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";

export default async function LandingPage({
  params,
}: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDict(lang);
  const t = dict.landing;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 70% 10%, rgba(212,175,55,0.16), transparent 60%), radial-gradient(50% 50% at 10% 90%, rgba(56,189,248,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <span className="inline-block rounded-full border border-gold/40 px-4 py-1 text-sm text-gold">
            {t.heroBadge}
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight text-white sm:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            {t.heroText}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={`/${lang}/register`} className="btn-gold">
              {t.ctaCreate}
            </Link>
            <a href="#how" className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-200 hover:border-slate-400">
              {t.ctaHow}
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">
          {t.howTitle}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.steps.map((step, i) => (
            <div key={i} className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold font-bold text-slate-950">
                {i + 1}
              </div>
              <h3 className="mt-4 font-bold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold text-white">
            {t.featuresTitle}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {t.features.map((f, i) => (
              <div key={i} className="p-6">
                <div className="mb-3 h-2 w-12 rounded bg-gold" />
                <h3 className="font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">
          {t.pricingTitle}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {t.pricing.map((p, i) => (
            <div
              key={i}
              className={`card p-8 ${i === 1 ? "border-gold/50" : ""}`}
            >
              <div className="text-2xl font-extrabold text-gold">
                {p.price}
              </div>
              <h3 className="mt-3 text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {p.text}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          {t.pricingNote}
        </p>
        <div className="mt-8 text-center">
          <Link
            href={`/${lang}/register`}
            className="btn-gold inline-block"
          >
            {t.ctaCreate}
          </Link>
        </div>
      </section>
    </div>
  );
}
