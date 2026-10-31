import Link from "next/link";
import { redirect } from "next/navigation";
import { QrBox } from "@/components/QrBox";
import { logoutAction } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial, Order } from "@/lib/types";

export default async function DashboardPage({
  params,
}: PageProps<"/[lang]/dashboard">) {
  const { lang } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  const user = await getSession();
  if (!user) redirect(`/${lang}/login`);

  const { data: memorialsRaw } = await supabase
    .from("memorials")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const memorials = (memorialsRaw ?? []) as unknown as Memorial[];
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const orders = (ordersRaw ?? []) as unknown as Order[];

  const t = dict.dashboard;

  function statusLabel(s: Memorial["status"]) {
    return s === "published"
      ? t.published
      : s === "ready"
        ? t.ready
        : t.draft;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">{t.title}</h1>
      <p className="mt-1 text-slate-400">
        {t.hello.replace("{name}", user.name)}
      </p>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{t.memorials}</h2>
          <Link href={`/${lang}/create`} className="btn-gold !py-2 text-sm">
            {dict.landing.ctaCreate}
          </Link>
        </div>

        {memorials.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <p className="text-slate-400">{t.empty}</p>
            <Link href={`/${lang}/create`} className="btn-gold mt-4 inline-block">
              {t.createFirst}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {memorials.map((m) => (
              <div key={m.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{m.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          m.status === "published"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : m.status === "ready"
                              ? "bg-sky-500/15 text-sky-300"
                              : "bg-slate-700/60 text-slate-300"
                        }`}
                      >
                        {statusLabel(m.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400" dir="ltr">
                      {m.birth_year || "?"} — {m.death_year || "?"}
                      {m.city ? ` · ${m.city}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {m.status === "published" && (
                      <Link
                        href={`/${lang}/m/${m.slug}`}
                        className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
                      >
                        {t.view}
                      </Link>
                    )}
                    <Link
                      href={`/${lang}/create?edit=${m.id}`}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
                    >
                      {t.manage}
                    </Link>
                  </div>
                </div>

                {m.status === "published" && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-gold">
                      {t.qr}
                    </summary>
                    <div className="mt-3 max-w-sm">
                      <QrBox
                        path={`/m/${m.slug}`}
                        labels={{
                          title: dict.order.qrTitle,
                          text: dict.order.qrText,
                          png: dict.order.downloadPng,
                          svg: dict.order.downloadSvg,
                          copy: dict.order.copyLink,
                          copied: dict.common.copied,
                          error: dict.order.qrError,
                        }}
                      />
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">{t.orders}</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-slate-400">{t.noOrders}</p>
        ) : (
          <div className="card mt-4 overflow-x-auto p-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-slate-400">
                  <th className="p-3 text-start">{dict.order.orderNo}</th>
                  <th className="p-3 text-start">{dict.wizard.payment}</th>
                  <th className="p-3 text-start">{dict.admin.amount}</th>
                  <th className="p-3 text-start">{dict.order.status}</th>
                  <th className="p-3 text-start">{t.createdAt}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-800">
                    <td className="p-3 font-mono text-xs text-slate-300" dir="ltr">
                      {o.id}
                    </td>
                    <td className="p-3 text-slate-300">
                      {o.payment_method === "cash"
                        ? dict.wizard.cash
                        : o.payment_method === "card"
                          ? dict.wizard.card
                          : dict.wizard.online}
                    </td>
                    <td className="p-3 text-slate-300" dir="ltr">
                      {o.amount} {o.currency}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          o.status === "paid"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : o.status === "shipped"
                              ? "bg-sky-500/15 text-sky-300"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {o.status === "paid"
                          ? dict.admin.paid
                          : o.status === "shipped"
                            ? dict.admin.shipped
                            : dict.admin.pending}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500" dir="ltr">
                      {o.created_at.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form action={logoutAction} className="mt-10">
        <button className="text-sm text-slate-500 hover:text-slate-300">
          {dict.nav.logout}
        </button>
      </form>
    </div>
  );
}
