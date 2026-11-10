import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";
import { maskPhone, RESET_PHONE_COOKIE } from "@/lib/reset";
import { VerifyForm } from "@/components/VerifyForm";

/**
 * Step 2 of the password reset: the 6-digit code screen. The number being
 * verified comes from the httpOnly cookie the forgot step set — the visitor
 * is never asked to type it again. Without the cookie there is nothing to
 * verify, so the flow starts over.
 */
export default async function VerifyPage({
  params,
}: PageProps<"/[lang]/verify">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const jar = await cookies();
  const phone = jar.get(RESET_PHONE_COOKIE)?.value ?? "";
  if (!phone) redirect(`/${lang}/forgot?expired=1`);
  const dict = getDict(lang);
  return (
    <VerifyForm
      lang={lang}
      dict={dict as unknown as Record<string, unknown>}
      maskedPhone={maskPhone(phone)}
    />
  );
}
