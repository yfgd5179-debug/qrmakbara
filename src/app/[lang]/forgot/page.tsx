import { redirect } from "next/navigation";
import { getDict, hasLocale } from "@/lib/dict";
import { ForgotForm } from "@/components/ForgotForm";

export default async function ForgotPage({
  params,
  searchParams,
}: PageProps<"/[lang]/forgot">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const sp = await searchParams;
  const dict = getDict(lang);
  return (
    <ForgotForm
      lang={lang}
      dict={dict as unknown as Record<string, unknown>}
      expired={sp?.expired === "1"}
    />
  );
}
