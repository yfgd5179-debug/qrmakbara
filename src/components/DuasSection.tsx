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
    <section className="mt-14 sm:mt-16">
      <h2 className="text-center text-2xl font-bold text-white">
        {t.title}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400">
        {t.intro}
      </p>

      <h3 className="mt-8 text-center text-lg font-semibold text-gold">
        {t.quranTitle}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {QURAN_READINGS.map(render)}
      </div>

      <h3 className="mt-10 text-center text-lg font-semibold text-gold">
        {t.duaTitle}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {DUAS.map(render)}
      </div>
    </section>
  );
}
