import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";

export default async function LandingPage({
  params,
}: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // A signed-in visitor never sees the marketing page: send them straight to
  // their dashboard — the same destination register/login redirect to.
  if (await getSession()) redirect(`/${lang}/dashboard`);
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
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-28">
          <span className="inline-block rounded-full border border-gold/40 px-4 py-1 text-sm text-gold">
            {t.heroBadge}
          </span>
          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:mt-5 sm:text-lg">
            {t.heroText}
          </p>
          {/* Phones: two full-width targets, stacked for the thumb. */}
          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4">
            <Link
              href={`/${lang}/register`}
              className="btn-gold w-full sm:w-auto"
            >
              {t.ctaCreate}
            </Link>
            <a
              href="#how"
              className="btn-outline w-full font-semibold sm:w-auto"
            >
              {t.ctaHow}
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
          {t.howTitle}
        </h2>
        <div className="mt-6 grid gap-4 sm:mt-10 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.steps.map((step, i) => (
            <div key={i} className="card p-5 sm:p-6">
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
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
            {t.featuresTitle}
          </h2>
          <div className="mt-6 grid gap-4 sm:mt-10 sm:gap-6 sm:grid-cols-3">
            {t.features.map((f, i) => (
              <div key={i} className="p-1 sm:p-6">
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
      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
          {t.pricingTitle}
        </h2>
        <div className="mt-6 grid gap-4 sm:mt-10 sm:gap-6 sm:grid-cols-2">
          {t.pricing.map((p, i) => (
            <div
              key={i}
              className={`card p-6 sm:p-8 ${i === 1 ? "border-gold/50" : ""}`}
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
            className="btn-gold w-full sm:w-auto"
          >
            {t.ctaCreate}
          </Link>
        </div>
      </section>
    </div>
  );
}
