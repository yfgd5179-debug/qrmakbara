import { notFound } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getDict, hasLocale } from "@/lib/dict";

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const sp = await searchParams;
  const dict = getDict(lang);
  return (
    <AuthForm
      mode="login"
      dict={dict}
      lang={lang}
      // Arriving from the reset flow: the server action redirects here only
      // after the new password has been stored.
      notice={sp?.reset === "1" ? dict.auth.resetSuccess : undefined}
    />
  );
}
