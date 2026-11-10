import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";
import {
  RESET_OK_COOKIE,
  RESET_PHONE_COOKIE,
  resetOkToken,
} from "@/lib/reset";
import { NewPasswordForm } from "@/components/NewPasswordForm";

/**
 * Step 3 of the password reset: only the new password is asked here. Both
 * cookies (phone + verified-code proof) must be present and valid — otherwise
 * the visitor is sent back to the start of the flow.
 */
export default async function NewPasswordPage({
  params,
}: PageProps<"/[lang]/newpass">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const jar = await cookies();
  const phone = jar.get(RESET_PHONE_COOKIE)?.value ?? "";
  const proof = jar.get(RESET_OK_COOKIE)?.value ?? "";
  if (!phone || !proof || proof !== resetOkToken(phone)) {
    redirect(`/${lang}/forgot?expired=1`);
  }
  const dict = getDict(lang);
  return <NewPasswordForm lang={lang} dict={dict as unknown as Record<string, unknown>} />;
}
