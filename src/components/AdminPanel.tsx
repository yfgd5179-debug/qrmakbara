"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminLogoutAction, adminSetOrderStatusAction } from "@/lib/actions";
import { formatPrice } from "@/lib/commerce";
import type { Dict } from "@/lib/dict";
import type { Memorial, Order, User } from "@/lib/types";

type AdminOrder = Order & { memorial_name: string; memorial_slug: string };

const STATUSES: Order["status"][] = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
];

const STATUS_BADGE: Record<Order["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  shipped: "bg-sky-500/15 text-sky-300",
  delivered: "bg-indigo-500/15 text-indigo-300",
  cancelled: "bg-rose-500/15 text-rose-300",
};

export function AdminPanel({
  dict,
  lang,
  orders,
  memorials,
  users,
}: {
  dict: Dict;
  lang: string;
  orders: AdminOrder[];
  memorials: (Memorial & { user_phone: string; user_name: string })[];
  users: User[];
}) {
  const t = dict.admin;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Order["status"] | "all">("all");

  function statusLabel(s: Order["status"]) {
    return s === "paid"
      ? t.paid
      : s === "shipped"
        ? t.shipped
        : s === "delivered"
          ? t.delivered
          : s === "cancelled"
            ? t.cancelled
            : t.pending;
  }

  function setStatus(orderId: string, status: Order["status"]) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await adminSetOrderStatusAction(orderId, status);
      if ("error" in res) {
        setError(t.invalidKey);
      } else {
        setNotice(t.statusUpdated);
        router.refresh();
      }
    });
  }

  // Free-text search across order id, customer, phone, city and memorial.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (filter !== "all" && o.status !== filter) return false;
        if (!q) return true;
        return [
          o.id,
          o.contact_name,
          o.phone,
          o.city,
          o.address,
          o.memorial_name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      }),
    [orders, q, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const s of STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  // Revenue excludes cancelled orders; grouped per currency.
  const revenue = useMemo(() => {
    const by = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      by.set(o.currency, (by.get(o.currency) ?? 0) + o.amount);
    }
    return [...by.entries()]
      .map(([cur, amt]) => formatPrice(amt, cur))
      .join(" · ");
  }, [orders]);

  function exportCsv() {
    const header = [
      "id",
      "date",
      "contact_name",
      "phone",
      "city",
      "country",
      "address",
      "payment_method",
      "amount",
      "currency",
      "status",
      "memorial",
    ];
    const esc = (v: string | number) =>
      `"${String(v).replace(/"/g, '""')}"`;
    const rows = filtered.map((o) =>
      [
        o.id,
        o.created_at,
        o.contact_name,
        o.phone,
        o.city,
        o.country,
        o.address,
        o.payment_method,
        o.amount,
        o.currency,
        o.status,
        o.memorial_name,
      ]
        .map(esc)
        .join(",")
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-white">{t.title}</h1>
        <form action={adminLogoutAction.bind(null, lang)}>
          <button className="text-sm text-slate-500 hover:text-slate-300">
            {dict.nav.logout}
          </button>
        </form>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {/* Summary cards */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t.totalOrders} value={String(counts.all)} accent />
        <StatCard label={t.pending} value={String(counts.pending)} />
        <StatCard label={t.paid} value={String(counts.paid)} />
        <StatCard label={t.shipped} value={String(counts.shipped)} />
        <StatCard label={t.delivered} value={String(counts.delivered)} />
        <StatCard label={t.revenue} value={revenue || "—"} />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white">{t.orders}</h2>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-50"
          >
            {t.exportCsv} ({filtered.length})
          </button>
        </div>

        {/* Search + status filter */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="input !w-auto flex-1 min-w-[200px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...STATUSES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs ${
                  filter === s
                    ? "bg-gold text-[#1a1206]"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {s === "all" ? t.filterAll : statusLabel(s)} ({counts[s]})
              </button>
            ))}
          </div>
        </div>

        <div className="card mt-3 overflow-x-auto p-2">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="p-3 text-start">{t.orders}</th>
                <th className="p-3 text-start">{t.memorialCol}</th>
                <th className="p-3 text-start">{t.contact}</th>
                <th className="p-3 text-start">{t.address}</th>
                <th className="p-3 text-start">{t.payment}</th>
                <th className="p-3 text-start">{t.amount}</th>
                <th className="p-3 text-start">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-t border-slate-800 align-top">
                  <td className="p-3 font-mono text-xs text-slate-300" dir="ltr">
                    {o.id}
                    <div className="mt-1 text-slate-500">
                      {o.created_at.slice(0, 16).replace("T", " ")}
                    </div>
                  </td>
                  <td className="p-3 text-slate-300">
                    {o.memorial_slug ? (
                      <Link
                        href={`/${lang}/m/${o.memorial_slug}`}
                        className="text-gold underline"
                      >
                        {o.memorial_name || `/m/${o.memorial_slug}`}
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-300">
                    {o.contact_name}
                    <div dir="ltr" className="text-xs text-slate-500">
                      <a href={`tel:${o.phone}`} className="hover:text-slate-300">
                        {o.phone}
                      </a>
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
                  </td>
                  <td className="p-3 text-slate-200" dir="ltr">
                    {formatPrice(o.amount, o.currency)}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status]}`}
                      >
                        {statusLabel(o.status)}
                      </span>
                      <select
                        aria-label={t.status}
                        value={o.status}
                        disabled={pending}
                        onChange={(e) =>
                          setStatus(o.id, e.target.value as Order["status"])
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    {orders.length === 0 ? dict.dashboard.noOrders : t.noResults}
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
                      {m.user_phone} · {m.status} · /m/{m.slug}
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
                    {u.phone} · {u.country}
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-4 ${accent ? "border-gold/40" : ""}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={`mt-1 truncate font-bold ${accent ? "text-gold" : "text-white"}`}
        dir="ltr"
      >
        {value}
      </div>
    </div>
  );
}
