import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QrBox } from "@/components/QrBox";
import { getSession } from "@/lib/auth";
import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial, Order } from "@/lib/types";

export default async function OrderPage({
  params,
}: PageProps<"/[lang]/order/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) redirect("/ar");
  const dict = getDict(lang);
  const user = await getSession();
  if (!user) redirect(`/${lang}/login`);

  const { data: orderRaw } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const order = orderRaw as unknown as Order | undefined;
  if (!order || order.user_id !== user.id) notFound();

  const { data: memorialRaw } = await supabase
    .from("memorials")
    .select("*")
    .eq("id", order.memorial_id)
    .maybeSingle();
  const memorial = memorialRaw as unknown as Memorial | undefined;
  if (!memorial) notFound();

  const t = dict.order;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300">
          ✓
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">{t.title}</h1>
        <p className="mt-2 text-slate-400">{t.successText}</p>

        <dl className="mx-auto mt-6 grid max-w-md gap-3 text-start text-sm">
          <div className="flex justify-between rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{t.orderNo}</dt>
            <dd className="font-mono text-slate-200" dir="ltr">
              {order.id}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{t.payment}</dt>
            <dd className="text-slate-200">
              {order.payment_method === "cash"
                ? dict.wizard.cash
                : order.payment_method === "card"
                  ? dict.wizard.card
                  : dict.wizard.online}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{t.status}</dt>
            <dd className="text-slate-200">
              {order.status === "paid"
                ? dict.admin.paid
                : order.status === "shipped"
                  ? dict.admin.shipped
                  : dict.admin.pending}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{dict.wizard.total}</dt>
            <dd className="font-bold text-gold" dir="ltr">
              {order.amount} {order.currency}
            </dd>
          </div>
        </dl>

        <Link
          href={`/${lang}/m/${memorial.slug}`}
          className="mt-6 inline-block text-gold underline"
        >
          {t.memorialPage}
        </Link>
      </div>

      <div className="mt-6">
        <QrBox
          path={`/m/${memorial.slug}`}
          labels={{
            title: t.qrTitle,
            text: t.qrText,
            png: t.downloadPng,
            svg: t.downloadSvg,
            copy: t.copyLink,
            copied: dict.common.copied,
          }}
        />
      </div>

      <div className="mt-6 text-center">
        <Link
          href={`/${lang}/dashboard`}
          className="rounded-lg border border-slate-600 px-5 py-2.5 text-slate-200 hover:border-slate-400"
        >
          {dict.dashboard.title}
        </Link>
      </div>
    </div>
  );
}
