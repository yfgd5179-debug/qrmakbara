import { redirect } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";
import { ForgotForm } from "@/components/ForgotForm";

export default async function ForgotPage({
  params,
}: PageProps<"/[lang]/forgot">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  return <ForgotForm lang={lang} dict={dict as unknown as Record<string, unknown>} />;
}
