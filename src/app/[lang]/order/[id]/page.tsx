import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MetalPlaque } from "@/components/MetalPlaque";
import { startPaymentAction } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { formatPrice, orderStatusLabel } from "@/lib/commerce";
import { getDict, hasLocale } from "@/lib/dict";
import { supabase } from "@/lib/db";
import type { Memorial, Order } from "@/lib/types";
import { qiConfigured } from "@/lib/qicard";
import { zaincashConfigured } from "@/lib/zaincash";

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

  // Which gateway (if any) can take this pending order's money right now.
  const gatewayReady =
    order.payment_method === "card" ? qiConfigured() : zaincashConfigured();
  const awaitingGateway =
    order.status === "pending" &&
    (order.payment_method === "online" || order.payment_method === "card");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="card p-5 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-slate-400">{t.successText}</p>

        <dl className="mx-auto mt-6 grid max-w-md gap-3 text-start text-sm">
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="shrink-0 text-slate-400">{t.orderNo}</dt>
            <dd className="min-w-0 truncate text-end font-mono text-slate-200" dir="ltr">
              {order.id}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{t.payment}</dt>
            <dd className="text-slate-200">
              {order.payment_method === "cash"
                ? dict.wizard.cash
                : order.payment_method === "card"
                  ? dict.wizard.card
                  : dict.wizard.online}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{t.status}</dt>
            <dd className="text-slate-200">
              {orderStatusLabel(order.status, dict.admin)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-900/70 px-4 py-3">
            <dt className="text-slate-400">{dict.wizard.total}</dt>
            <dd className="font-bold text-gold" dir="ltr">
              {formatPrice(order.amount, order.currency)}
            </dd>
          </div>
        </dl>

        {/* Online/card orders land here still pending — offer the gateway
            again until the payment is confirmed (or arrange it manually for
            the currencies the gateways do not carry). */}
        {awaitingGateway && (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-start text-sm text-slate-300">
            {gatewayReady ? (
              <>
                <p>{t.payPendingNote}</p>
                <form action={startPaymentAction.bind(null, order.id, lang)}>
                  <button type="submit" className="btn-gold mt-3 w-full">
                    {order.payment_method === "card" ? t.payNowCard : t.payNow}
                  </button>
                </form>
              </>
            ) : (
              <p>{t.payContactNote}</p>
            )}
          </div>
        )}

        <Link
          href={`/${lang}/m/${memorial.slug}`}
          className="mt-6 inline-block text-gold underline"
        >
          {t.memorialPage}
        </Link>
      </div>

      <div className="mt-6">
        <MetalPlaque
          path={`/m/${memorial.slug}`}
          name={memorial.name}
          birthYear={memorial.birth_year}
          deathYear={memorial.death_year}
          gender={memorial.gender}
          lang={lang}
          labels={{
            title: t.qrTitle,
            text: t.qrText,
            png: t.downloadPng,
            svg: t.downloadSvg,
            copy: t.copyLink,
            copied: dict.common.copied,
            error: t.qrError,
          }}
        />
      </div>

      <div className="mt-6 text-center">
        <Link
          href={`/${lang}/dashboard`}
          className="btn-outline w-full text-sm sm:w-auto"
        >
          {dict.dashboard.title}
        </Link>
      </div>
    </div>
  );
}
