import {
  ARABIC_FONT,
  DUAS,
  QURAN_READINGS,
  type DuaItem,
} from "@/lib/duas";
import type { Dict } from "@/lib/dict";

/**
 * "Quran & duas for the departed" — two labelled grids of recited Arabic
 * text. The wording is fixed by tradition, so only the headings are
 * localized; a recorded female gender switches the dua wording to the
 * feminine form.
 *
 * The whole section collapses into a single tappable bar (native
 * <details>, no client JS) so it doesn't push the rest of the memorial
 * down on a phone. The 44 px summary row doubles as its tap target.
 */
export function DuasSection({
  t,
  gender,
}: {
  t: Dict["duas"];
  gender: string;
}) {
  const label = (item: DuaItem) =>
    t.items[item.id as keyof typeof t.items];

  const render = (item: DuaItem) => {
    const text =
      gender === "female" && item.textF ? item.textF : item.text;
    return (
      <div key={item.id} className="card flex flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4
            className="font-bold text-gold"
            style={{ fontFamily: ARABIC_FONT }}
          >
            {item.title}
          </h4>
          <span className="text-xs text-slate-500">{label(item)}</span>
        </div>
        <p
          dir="rtl"
          className="mt-3 flex-1 text-[17px] leading-[2.1] text-slate-200"
          style={{ fontFamily: ARABIC_FONT }}
        >
          {text}
        </p>
        {item.note && (
          <p
            dir="rtl"
            className="mt-3 text-sm text-slate-500"
            style={{ fontFamily: ARABIC_FONT }}
          >
            {item.note}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="mt-10 sm:mt-14">
      <details className="group overflow-hidden rounded-2xl border border-gold/30 bg-slate-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 select-none [&::-webkit-details-marker]:hidden sm:px-6">
          <span className="text-start">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              {t.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              {t.intro}
            </p>
          </span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 shrink-0 text-gold transition-transform duration-200 group-open:rotate-180"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </summary>

        <div className="px-4 pb-5 sm:px-6">
          <h3 className="mt-2 text-center text-base font-semibold text-gold sm:text-lg">
            {t.quranTitle}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {QURAN_READINGS.map(render)}
          </div>

          <h3 className="mt-7 text-center text-base font-semibold text-gold sm:mt-8 sm:text-lg">
            {t.duaTitle}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {DUAS.map(render)}
          </div>
        </div>
      </details>
    </section>
  );
}
