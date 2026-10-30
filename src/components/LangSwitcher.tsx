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
    const parts = pathname.split("/");
    parts[1] = locale;
    router.push(parts.join("/") || `/${locale}`);
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={current}
        onChange={(e) => switchTo(e.target.value as Locale)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none"
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
