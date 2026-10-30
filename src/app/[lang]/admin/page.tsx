import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial, Order, User } from "@/lib/types";
import { AdminPanel } from "@/components/AdminPanel";
import { redirect } from "next/navigation";

export default async function AdminPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  const { key = "" } = await searchParams;

  const expected =
    process.env.ADMIN_KEY ??
    (process.env.NODE_ENV !== "production" ? "admin123" : "");
  const authorized = !!expected && key === expected;

  if (!authorized) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <div className="card p-8">
          <h1 className="text-xl font-bold text-white">{dict.admin.title}</h1>
          <form method="GET" className="mt-4 space-y-3">
            <input
              className="input"
              type="password"
              name="key"
              placeholder={dict.admin.key}
              dir="ltr"
            />
            <button className="btn-gold w-full">{dict.admin.enter}</button>
          </form>
        </div>
      </div>
    );
  }

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  const orders = (ordersRaw ?? []) as unknown as Order[];

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
    <AdminPanel
      dict={dict}
      lang={lang}
      adminKey={key}
      orders={orders}
      memorials={memorials}
      users={users}
    />
  );
}
