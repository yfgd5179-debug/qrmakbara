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

/** Sends `/` to the visitor's language and serves `/m/<slug>` (the QR code URL). */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(`/${getLocale(req)}`, req.url));
  }

  if (pathname.startsWith("/m/")) {
    const rest = pathname.slice(3);
    return NextResponse.rewrite(
      new URL(`/${getLocale(req)}/m/${rest}`, req.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/m/:path*"],
};
