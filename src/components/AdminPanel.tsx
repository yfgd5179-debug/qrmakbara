"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { adminSetOrderStatusAction } from "@/lib/actions";
import type { Dict } from "@/lib/dict";
import type { Memorial, Order, User } from "@/lib/types";

export function AdminPanel({
  dict,
  lang,
  adminKey,
  orders,
  memorials,
  users,
}: {
  dict: Dict;
  lang: string;
  adminKey: string;
  orders: Order[];
  memorials: (Memorial & { user_email: string })[];
  users: User[];
}) {
  const t = dict.admin;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setStatus(orderId: string, status: Order["status"]) {
    startTransition(async () => {
      const res = await adminSetOrderStatusAction(orderId, status, adminKey);
      if ("error" in res) setError(t.invalidKey);
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">{t.title}</h1>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold text-white">
          {t.orders} ({orders.length})
        </h2>
        <div className="card mt-3 overflow-x-auto p-2">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="p-3 text-start">{t.orders}</th>
                <th className="p-3 text-start">{t.contact}</th>
                <th className="p-3 text-start">{t.address}</th>
                <th className="p-3 text-start">{t.payment}</th>
                <th className="p-3 text-start">{t.amount}</th>
                <th className="p-3 text-start">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-800 align-top">
                  <td className="p-3 font-mono text-xs text-slate-300" dir="ltr">
                    {o.id}
                    <div className="mt-1 text-slate-500">
                      {o.created_at.slice(0, 16).replace("T", " ")}
                    </div>
                  </td>
                  <td className="p-3 text-slate-300">
                    {o.contact_name}
                    <div dir="ltr" className="text-xs text-slate-500">
                      {o.phone}
                    </div>
                  </td>
                  <td className="p-3 text-slate-400">
                    {o.address}
                    <div className="text-xs text-slate-500">
                      {[o.city, dict.countries[o.country as keyof typeof dict.countries]]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </td>
                  <td className="p-3 text-slate-300">
                    {o.payment_method === "cash"
                      ? dict.wizard.cash
                      : o.payment_method === "card"
                        ? dict.wizard.card
                        : dict.wizard.online}
                    <div className="text-xs text-slate-500">
                      {o.status === "paid"
                        ? t.paid
                        : o.status === "shipped"
                          ? t.shipped
                          : t.pending}
                    </div>
                  </td>
                  <td className="p-3 text-slate-200" dir="ltr">
                    {o.amount} {o.currency}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {o.status !== "paid" && (
                        <button
                          disabled={pending}
                          onClick={() => setStatus(o.id, "paid")}
                          className="rounded bg-emerald-600/80 px-2 py-1 text-xs text-white hover:bg-emerald-600"
                        >
                          {t.markPaid}
                        </button>
                      )}
                      {o.status !== "shipped" && (
                        <button
                          disabled={pending}
                          onClick={() => setStatus(o.id, "shipped")}
                          className="rounded bg-sky-600/80 px-2 py-1 text-xs text-white hover:bg-sky-600"
                        >
                          {t.markShipped}
                        </button>
                      )}
                      {o.status !== "pending" && (
                        <button
                          disabled={pending}
                          onClick={() => setStatus(o.id, "pending")}
                          className="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
                        >
                          {t.markPending}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    {dict.dashboard.noOrders}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold text-white">
            {t.memorials} ({memorials.length})
          </h2>
          <div className="card mt-3 max-h-96 overflow-y-auto p-3 text-sm">
            <ul className="space-y-2">
              {memorials.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">
                      {m.name || "—"}
                    </div>
                    <div className="truncate text-xs text-slate-500" dir="ltr">
                      {m.user_email} · {m.status} · /m/{m.slug}
                    </div>
                  </div>
                  <Link
                    href={`/${lang}/m/${m.slug}`}
                    className="shrink-0 text-xs text-gold underline"
                  >
                    {dict.dashboard.view}
                  </Link>
                </li>
              ))}
              {memorials.length === 0 && (
                <li className="text-slate-500">{dict.dashboard.empty}</li>
              )}
            </ul>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white">
            {t.users} ({users.length})
          </h2>
          <div className="card mt-3 max-h-96 overflow-y-auto p-3 text-sm">
            <ul className="space-y-2">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="border-b border-slate-800 pb-2 text-slate-300"
                >
                  <span className="font-medium">{u.name}</span>
                  <div className="text-xs text-slate-500" dir="ltr">
                    {u.email} · {u.country}
                  </div>
                </li>
              ))}
              {users.length === 0 && (
                <li className="text-slate-500">{dict.dashboard.empty}</li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
