import { notFound } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getDict, hasLocale } from "@/lib/dict";

export default async function LoginPage({
  params,
}: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDict(lang);
  return <AuthForm mode="login" dict={dict} lang={lang} />;
}
