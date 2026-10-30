import { en, type Dict } from "./dicts/en";
import { ar } from "./dicts/ar";
import { ku } from "./dicts/ku";
import { tr } from "./dicts/tr";
import { LOCALES, type Locale } from "./types";

export type { Dict };

const dictionaries: Record<Locale, Dict> = { ar, ku, en, tr };

export function hasLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

export function getDict(locale: Locale): Dict {
  return dictionaries[locale] ?? en;
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar" || locale === "ku";
}

/** Replace `{name}` placeholders inside dictionary strings. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m
  );
}

export const COUNTRY_CODES = [
  "IQ",
  "SY",
  "IR",
  "TR",
  "SA",
  "AE",
  "KW",
  "QA",
  "LB",
  "JO",
  "DE",
  "GB",
  "US",
  "SE",
  "FR",
  "CA",
  "OTHER",
] as const;
