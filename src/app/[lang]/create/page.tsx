import { redirect } from "next/navigation";
import { Wizard } from "@/components/Wizard";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";

export default async function CreatePage({
  params,
}: PageProps<"/[lang]/create">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  const user = await getSession();
  if (!user) redirect(`/${lang}/login`);

  return (
    <Wizard
      lang={lang}
      dict={dict}
      user={{ name: user.name, phone: user.phone, country: user.country }}
    />
  );
}
