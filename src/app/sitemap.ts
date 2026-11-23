import type { MetadataRoute } from "next";
import { supabase } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { LOCALES } from "@/lib/types";

/**
 * Public index: the four landing pages plus every published memorial.
 *
 * Memorials are served language-neutrally at `/m/<slug>` (src/proxy.ts
 * rewrites to the visitor's locale), so that URL is canonical and each
 * language variant is declared as a hreflang alternate.
 *
 * force-dynamic: the memorial list must reflect the database, not the
 * build snapshot — crawlers hit this route long after each deploy.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  const landingLanguages = Object.fromEntries(
    LOCALES.map((lang) => [lang, `${SITE_URL}/${lang}`])
  );
  for (const lang of LOCALES) {
    entries.push({
      url: `${SITE_URL}/${lang}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: lang === "ar" ? 1 : 0.8,
      alternates: {
        languages: { ...landingLanguages, "x-default": `${SITE_URL}/ar` },
      },
    });
  }

  try {
    const { data, error } = await supabase
      .from("memorials")
      .select("slug, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!error) {
      for (const row of (data ?? []) as { slug: string; created_at: string }[]) {
        const languages = Object.fromEntries(
          LOCALES.map((lang) => [lang, `${SITE_URL}/${lang}/m/${row.slug}`])
        );
        entries.push({
          url: `${SITE_URL}/m/${row.slug}`,
          lastModified: new Date(row.created_at),
          changeFrequency: "monthly",
          priority: 0.6,
          alternates: {
            languages: {
              ...languages,
              "x-default": `${SITE_URL}/m/${row.slug}`,
            },
          },
        });
      }
    }
  } catch {
    // Supabase unreachable — still serve the static landing entries.
  }

  return entries;
}
