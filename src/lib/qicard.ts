import { trackEvent } from "./analytics.server";
import { supabase } from "./db";
import type { Order } from "./types";

/**
 * Qi Card payment gateway (Iraq, IQD) — hosted payment page with 3D Secure.
 *
 * Server-only by convention: the module holds merchant credentials, so it is
 * imported from server actions and route handlers exclusively, never from
 * client components.
 *
 * Flow (same shape as ZainCash):
 *  1. `qiCreatePayment` opens a payment and returns `formUrl` — the gateway's
 *     hosted card page — where the customer enters the card and the 3DS OTP.
 *  2. Qi redirects the browser back to /api/payments/qicard/return/… and
 *     POSTs a webhook to /api/payments/qicard/webhook.
 *  3. Both paths call `confirmQiCardOrder`, which re-asks the status API —
 *     the gateway itself, never the redirect or the webhook body, decides
 *     whether the money moved. The payload only *points* at a payment id;
 *     the status response must then match this order's id (additionalInfo
 *     .orderId), amount and currency before the order flips to paid.
 *
 * Sandbox credentials are public at https://developers-gate.qi.iq and work
 * against https://uat-sandbox-3ds-api.qi.iq with a test card. Production
 * credentials arrive after acquirer/merchant onboarding.
 *
 * The webhook carries an `X-Signature` (RSA-SHA256) whose public key must be
 * requested from the gateway team; until then the webhook body is treated as
 * a mere hint and every confirmation goes through the status API instead.
 */

const HOST = (
  process.env.QICARD_BASE_URL || "https://uat-sandbox-3ds-api.qi.iq"
).replace(/\/+$/, "");
const BASE = `${HOST}/api/v1`;
const USERNAME = process.env.QICARD_USERNAME || "";
const PASSWORD = process.env.QICARD_PASSWORD || "";
const TERMINAL_ID = process.env.QICARD_TERMINAL_ID || "";

export function qiConfigured(): boolean {
  return Boolean(USERNAME && PASSWORD && TERMINAL_ID);
}

/** Basic auth + the merchant terminal header every Qi endpoint requires. */
function qiHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`,
    "X-Terminal-Id": TERMINAL_ID,
  };
}

/** Gateway form locales — ar/ku/en/tr all accepted (verified in sandbox). */
function qiLocale(lang: string): string {
  if (lang === "ar") return "ar_IQ";
  if (lang === "ku") return "ku_IQ";
  if (lang === "tr") return "tr_TR";
  return "en_US";
}

/** "+964 770 …" / "0770 …" → "00964770…" as the gateway example shows. */
function qiPhone(raw: string | undefined): string | undefined {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("00")) return digits;
  if (digits.startsWith("964")) return `00${digits}`;
  if (digits.startsWith("0")) return `00964${digits.slice(1)}`;
  return `00${digits}`;
}

/* ------------------------------- create ------------------------------- */

export type QiCreateResult = {
  paymentId: string;
  formUrl: string;
};

export type QiCreateParams = {
  /** Our order id — echoed back as additionalInfo.orderId, so a paid payment is always attributable to this order. */
  orderId: string;
  /** Amount in IQD — the gateway only supports Iraqi dinar. */
  amount: number;
  lang: string;
  phone?: string;
  contactName?: string;
  /** Absolute URLs; the customer is redirected here when the form finishes. */
  finishPaymentUrl: string;
  /** Absolute URL Qi POSTs status notifications to. */
  notificationUrl: string;
};

/** Opens a payment. Returns null on any failure (the caller keeps the order pending). */
export async function qiCreatePayment(
  params: QiCreateParams
): Promise<QiCreateResult | null> {
  if (!qiConfigured()) return null;
  try {
    const parts = (params.contactName || "").trim().split(/\s+/);
    const phone = qiPhone(params.phone);
    const res = await fetch(`${BASE}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...qiHeaders() },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        amount: params.amount,
        currency: "IQD",
        locale: qiLocale(params.lang),
        finishPaymentUrl: params.finishPaymentUrl,
        notificationUrl: params.notificationUrl,
        ...(phone || parts[0]
          ? {
              customerInfo: {
                ...(parts[0] ? { firstName: parts[0] } : {}),
                ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}),
                ...(phone ? { phone } : {}),
              },
            }
          : {}),
        additionalInfo: { orderId: params.orderId },
        appChannel: false,
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      paymentId?: string;
      formUrl?: string;
      status?: string;
      error?: { code?: number; description?: string };
    } | null;
    if (!res.ok || !json?.paymentId || !json?.formUrl) {
      console.error("qicard create failed", res.status, JSON.stringify(json));
      return null;
    }
    return { paymentId: json.paymentId, formUrl: json.formUrl };
  } catch (e) {
    console.error("qicard create error", e);
    return null;
  }
}

/* ------------------------------- status ------------------------------- */

export type QiStatus = {
  status: string;
  amount: number | null;
  currency: string | null;
  orderId: string | null;
  canceled: boolean;
};

/**
 * Asks the gateway about one payment. Returns null when the payment is
 * unknown or the call failed — both mean "not provable", so callers must
 * leave the order untouched.
 */
export async function qiPaymentStatus(
  paymentId: string
): Promise<QiStatus | null> {
  if (!qiConfigured() || !paymentId) return null;
  try {
    const res = await fetch(
      `${BASE}/payment/${encodeURIComponent(paymentId)}/status`,
      { headers: qiHeaders(), cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      paymentId?: string;
      status?: string;
      amount?: number;
      currency?: string;
      canceled?: boolean;
      additionalInfo?: { orderId?: string };
    } | null;
    if (!json || typeof json !== "object") return null;
    return {
      status: String(json.status ?? ""),
      amount: typeof json.amount === "number" ? json.amount : null,
      currency: json.currency ?? null,
      orderId: json.additionalInfo?.orderId ?? null,
      canceled: Boolean(json.canceled),
    };
  } catch (e) {
    console.error("qicard status error", e);
    return null;
  }
}

/** The only status in which money has actually moved (v2.0.4: SUCCESS / FAILED / CREATED / AUTHENTICATION_FAILED). */
export function isQiPaidStatus(status: string): boolean {
  return status.trim().toUpperCase() === "SUCCESS";
}

/* ---------------------------- confirmation ---------------------------- */

/**
 * Re-checks this order's payment with the status API and flips
 * pending → paid exactly once when — and only when — the gateway confirms
 * success for *this* order's id, amount and currency. A forged or replayed
 * reference therefore can never mark an order paid.
 */
export async function confirmQiCardOrder(order: Order): Promise<boolean> {
  if (order.status !== "pending" || order.payment_method !== "card") {
    return order.status === "paid";
  }
  if (!order.payment_ref) return false;

  const st = await qiPaymentStatus(order.payment_ref);
  if (!st) return false;
  if (!isQiPaidStatus(st.status)) return false;
  if (st.canceled) return false;
  if (st.orderId !== order.id) return false;
  if (Number(st.amount) !== Number(order.amount)) return false;
  if (st.currency !== order.currency) return false;

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (error || !data || data.length === 0) return false;
  await trackEvent("payment_success", {
    amount: order.amount,
    currency: order.currency,
  });
  return true;
}
