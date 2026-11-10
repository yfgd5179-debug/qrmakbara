"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/types";

const LABELS: Record<string, string> = {
  ar: "العربية",
  ku: "کوردی",
  en: "EN",
  tr: "TR",
};

export function LangSwitcher({
  current,
  label,
}: {
  current: string;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    // Remember the choice for the QR redirect as well.
    document.cookie = `lang=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;

    // The QR URL is `/m/<slug>` (rewritten to `/<locale>/m/<slug>` internally)
    // and has no locale segment of its own — replacing `parts[1]` there would
    // produce `/<locale>/<slug>` and a 404. Prefix it instead.
    const parts = pathname.split("/");
    const hasLocale = (LOCALES as string[]).includes(parts[1] ?? "");
    const next = hasLocale
      ? pathname.replace(/^\/[^/]+/, `/${locale}`)
      : `/${locale}${pathname}`;

    // Keep the current query string (`?edit=<id>` in the wizard, admin filters…).
    // Read it from the address bar (only runs on a user interaction) so this
    // component never needs a useSearchParams() Suspense boundary.
    const qs = window.location.search.replace(/^\?/, "");
    router.push(qs ? `${next}?${qs}` : next);
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      {/* text-base (16px): anything smaller makes iOS Safari zoom in when
          the select is focused. */}
      <select
        aria-label={label}
        value={current}
        onChange={(e) => switchTo(e.target.value as Locale)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2.5 text-base text-slate-200 outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
