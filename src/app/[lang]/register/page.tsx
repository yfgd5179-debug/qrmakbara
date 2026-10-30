import { notFound } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getDict, hasLocale } from "@/lib/dict";

export default async function RegisterPage({
  params,
}: PageProps<"/[lang]/register">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDict(lang);
  return <AuthForm mode="register" dict={dict} lang={lang} />;
}
