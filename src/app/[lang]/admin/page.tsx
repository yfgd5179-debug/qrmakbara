import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial, Order, User } from "@/lib/types";
import { AdminPanel } from "@/components/AdminPanel";
import { AdminLogin } from "@/components/AdminLogin";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminPage({
  params,
}: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);

  // Access is decided by the signed httpOnly cookie, never by a ?key= param.
  if (!(await isAdmin())) {
    return <AdminLogin dict={dict} lang={lang} />;
  }

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("*, memorials(name, slug)")
    .order("created_at", { ascending: false });
  const orders = (ordersRaw ?? []).map((o: Record<string, unknown>) => ({
    ...o,
    memorial_name:
      (o.memorials as { name?: string } | null)?.name ?? "",
    memorial_slug:
      (o.memorials as { slug?: string } | null)?.slug ?? "",
  })) as unknown as (Order & {
    memorial_name: string;
    memorial_slug: string;
  })[];

  const { data: memorialsRaw } = await supabase
    .from("memorials")
    .select("*, users(email)")
    .order("created_at", { ascending: false });
  const memorials = (memorialsRaw ?? []).map((m: Record<string, unknown>) => ({
    ...m,
    user_email: (m.users as { email?: string } | null)?.email ?? "",
  })) as unknown as (Memorial & { user_email: string })[];

  const { data: usersRaw } = await supabase
    .from("users")
    .select("id, email, name, phone, country, created_at")
    .order("created_at", { ascending: false });
  const users = (usersRaw ?? []) as unknown as User[];

  return (
    <AdminPanel dict={dict} lang={lang} orders={orders} memorials={memorials} users={users} />
  );
}
