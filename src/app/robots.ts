import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { LOCALES } from "@/lib/types";

/**
 * Public content (landing pages + memorials) is crawlable; the signed-in
 * app, admin, API and order routes are not. Login/register stay allowed —
 * they are the only entry points for a returning user from search.
 */
const PRIVATE_PATHS = [
  "dashboard",
  "admin",
  "order",
  "newpass",
  "reset",
  "verify",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          ...LOCALES.flatMap((lang) =>
            PRIVATE_PATHS.map((path) => `/${lang}/${path}`)
          ),
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
