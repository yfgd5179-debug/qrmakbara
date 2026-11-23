/**
 * Canonical production origin for robots/sitemap/OG URLs.
 * NEXT_PUBLIC_SITE_URL overrides it (custom domain or preview deploys).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrmakbara.vercel.app"
).replace(/\/+$/, "");
