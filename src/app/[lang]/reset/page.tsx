import { redirect } from "next/navigation";
import { hasLocale } from "@/lib/dict";

/**
 * The reset flow moved to `forgot → verify → newpass`; this route only keeps
 * old links (bookmarks, the previous e-mail/SMS wording) from dead-ending.
 */
export default async function ResetPage({
  params,
}: PageProps<"/[lang]/reset">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  redirect(`/${lang}/forgot`);
}
