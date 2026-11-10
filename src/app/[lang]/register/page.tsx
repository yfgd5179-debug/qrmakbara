import { notFound, redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";

export default async function RegisterPage({
  params,
}: PageProps<"/[lang]/register">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  // The account already exists for this session → dashboard, not the form.
  if (await getSession()) redirect(`/${lang}/dashboard`);
  const dict = getDict(lang);
  return <AuthForm mode="register" dict={dict} lang={lang} />;
}
