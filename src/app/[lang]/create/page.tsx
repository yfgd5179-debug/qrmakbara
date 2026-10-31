import { redirect } from "next/navigation";

export const maxDuration = 60;
import { Wizard } from "@/components/Wizard";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial } from "@/lib/types";

export default async function CreatePage({
  params,
  searchParams,
}: PageProps<"/[lang]/create">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  const user = await getSession();
  if (!user) redirect(`/${lang}/login`);

  // /create?edit=<id> — continue editing an existing memorial (dashboard
  // "Manage"). Only the owner may load it; anything else starts fresh.
  const { edit } = await searchParams;
  let initial: Memorial | null = null;
  if (edit) {
    const { data } = await supabase
      .from("memorials")
      .select("*")
      .eq("id", edit)
      .eq("user_id", user.id)
      .maybeSingle();
    initial = (data as unknown as Memorial) ?? null;
  }

  return (
    <Wizard
      lang={lang}
      dict={dict}
      user={{ name: user.name, phone: user.phone, country: user.country }}
      initial={initial}
    />
  );
}
