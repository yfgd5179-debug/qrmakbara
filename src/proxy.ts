import { NextResponse, type NextRequest } from "next/server";

const locales = ["ar", "ku", "en", "tr"];

function getLocale(req: NextRequest): string {
  const cookie = req.cookies.get("lang")?.value;
  if (cookie && locales.includes(cookie)) return cookie;
  const header = req.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const code = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (code && locales.includes(code)) return code;
  }
  return "ar";
}

/**
 * Builds a Content-Security-Policy with a per-request script nonce.
 *
 * Uses the CSP3 recommended pattern: `'nonce-…' 'strict-dynamic'` plus
 * `'unsafe-inline'`/`'unsafe-eval'`/`https:` fallbacks that CSP3 browsers
 * ignore but older ones use. `strict-dynamic` lets scripts loaded by an
 * already-trusted (nonced) bootstrap script — Next.js runtime chunks and, in
 * dev, Turbopack's HMR client — run without each needing its own nonce.
 * - style/img/media/connect allow self + https so Supabase Storage and
 *   Backblaze B2 (presigned URLs) media continue to load.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Locale redirect for `/`, rewrite for the QR URL `/m/<slug>`, and a strict
 * nonce-based CSP on every page. `btoa` (not Buffer) because middleware runs
 * on the Edge runtime.
 */
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Forward the CSP on the REQUEST so Next.js auto-applies the nonce to its
  // own inline scripts, and set it on the RESPONSE so the browser enforces it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = req.nextUrl;

  let res: NextResponse;
  if (pathname === "/") {
    res = NextResponse.redirect(new URL(`/${getLocale(req)}`, req.url));
  } else if (pathname.startsWith("/m/")) {
    const rest = pathname.slice(3);
    res = NextResponse.rewrite(
      new URL(`/${getLocale(req)}/m/${rest}`, req.url),
      { request: { headers: requestHeaders } }
    );
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Apply CSP to every page but skip static assets (they don't need it).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
