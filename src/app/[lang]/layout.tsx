import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../globals.css";
import { LangSwitcher } from "@/components/LangSwitcher";
import { logoutAction } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale, isRtl } from "@/lib/dict";
import { LOCALES } from "@/lib/types";

// Vercel: let server actions (AI story generation, Supabase writes, order
// flow) run up to 120 s — the platform default is much lower and would cut
// slow AI calls short. Inherited by every page under /[lang].
export const maxDuration = 120;

// 99 % of visitors arrive on a phone: an explicit device-width viewport (with
// notch-safe insets) plus the dark theme colour for the browser chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1120",
};

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = getDict(lang);
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dict = getDict(lang);
  const dir = isRtl(lang) ? "rtl" : "ltr";
  const user = await getSession();

  return (
    <html lang={lang} dir={dir} className="h-full antialiased">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:gap-x-4 sm:px-4 sm:py-3">
            <Link
              href={`/${lang}`}
              className="text-base font-bold tracking-tight text-slate-100 sm:text-lg"
            >
              QR <span className="text-gold">Makbara</span>
            </Link>

            <nav className="ms-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm sm:gap-x-3">
              <Link
                href={`/${lang}`}
                className="hidden text-slate-300 hover:text-white sm:inline"
              >
                {dict.nav.home}
              </Link>
              {user && (
                <Link
                  href={`/${lang}/dashboard`}
                  className="text-slate-300 hover:text-white"
                >
                  {dict.nav.dashboard}
                </Link>
              )}
              {user && (
                <Link
                  href={`/${lang}/create`}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-100 hover:bg-slate-700"
                >
                  {dict.nav.create}
                </Link>
              )}
              {user && (
                <form action={logoutAction} className="inline">
                  <button
                    type="submit"
                    className="rounded-lg px-2 py-1.5 text-slate-400 hover:text-white"
                  >
                    {dict.nav.logout}
                  </button>
                </form>
              )}
              {!user && (
                <Link
                  href={`/${lang}/login`}
                  className="text-slate-300 hover:text-white"
                >
                  {dict.nav.login}
                </Link>
              )}
              {!user && (
                <Link href={`/${lang}/register`} className="btn-gold px-3! py-1.5! text-sm">
                  {dict.nav.register}
                </Link>
              )}
              <LangSwitcher current={lang} label={dict.nav.language} />
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-800 bg-slate-950">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 text-sm text-slate-400 sm:grid-cols-2 sm:py-8">
            <div>
              <div className="mb-2 font-bold text-slate-200">
                QR <span className="text-gold">Makbara</span>
              </div>
              <p>{dict.footer.about}</p>
            </div>
            <div className="sm:text-end">
              <p>{dict.footer.rights.replace("{year}", String(new Date().getFullYear()))}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
