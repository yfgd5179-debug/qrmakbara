import { redirect } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";
import { ResetForm } from "@/components/ResetForm";

export default async function ResetPage({
  params,
}: PageProps<"/[lang]/reset">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  return <ResetForm lang={lang} dict={dict as unknown as Record<string, unknown>} />;
}
