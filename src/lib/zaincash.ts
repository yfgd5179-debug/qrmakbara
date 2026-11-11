import { trackEvent } from "./analytics.server";
import { supabase } from "./db";
import type { Order } from "./types";

/**
 * ZainCash payment gateway (Iraq, IQD) — v2 REST client.
 *
 * Server-only by convention: the module holds merchant credentials, so it is
 * imported from server actions and route handlers exclusively, never from
 * client components.
 *
 * Flow:
 *  1. `zaincashInit` opens a transaction and returns the hosted payment page
 *     URL — the customer is sent there (wallet number + PIN + OTP).
 *  2. ZainCash redirects the browser back to /api/payments/zaincash/return/…
 *     and optionally POSTs a webhook.
 *  3. Both paths call `confirmZaincashOrder`, which re-asks the inquiry API —
 *     the gateway itself, never the redirect token or webhook body, decides
 *     whether the money moved. The payload only *points* at a transaction id;
 *     the inquiry response must then match this order's id, amount and
 *     currency before the order flips to paid.
 *
 * UAT (test) credentials are published at https://docs.zaincash.iq and work
 * against https://pg-api-uat.zaincash.iq with test wallets. Production
 * credentials arrive after merchant onboarding (bd@zaincash.iq).
 */

const BASE = (
  process.env.ZAINCASH_BASE_URL || "https://pg-api-uat.zaincash.iq"
).replace(/\/+$/, "");
const CLIENT_ID = process.env.ZAINCASH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ZAINCASH_CLIENT_SECRET || "";

export function zaincashConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/* ------------------------------- auth ------------------------------- */

let tokenCache: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

/** OAuth2 client-credentials token (24 h), cached with a 60 s safety margin. */
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const res = await fetch(`${BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "payment:read payment:write",
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`zaincash token HTTP ${res.status}`);
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) throw new Error("zaincash token: no access_token");
    tokenCache = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  })();
  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

/* ------------------------------- init ------------------------------- */

/** Gateway language codes: it accepts en/ar/ku only. */
function gatewayLang(lang: string): "en" | "ar" | "ku" {
  if (lang === "ar") return "ar";
  if (lang === "ku") return "ku";
  return "en";
}

/** "+964 770 123 4567" / "0770…" → "964770…" as the gateway expects. */
function gatewayPhone(raw: string): string | undefined {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("964")) return digits;
  if (digits.startsWith("0")) return `964${digits.slice(1)}`;
  return digits;
}

export type ZcInitResult = {
  transactionId: string;
  redirectUrl: string;
};

export type ZcInitParams = {
  /** Our order id — becomes the gateway's orderId, so a paid transaction is always attributable back to this order. */
  orderId: string;
  /** Amount in IQD — the gateway only supports Iraqi dinar. */
  amount: number;
  lang: string;
  phone?: string;
  /** Absolute URLs; ZainCash appends `?token=…` on return. */
  successUrl: string;
  failureUrl: string;
};

/** Opens a payment transaction. Returns null on any failure (the caller keeps the order pending). */
export async function zaincashInit(
  params: ZcInitParams
): Promise<ZcInitResult | null> {
  if (!zaincashConfigured()) return null;
  try {
    const token = await accessToken();
    const res = await fetch(
      `${BASE}/api/v2/payment-gateway/transaction/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language: gatewayLang(params.lang),
          externalReferenceId: crypto.randomUUID(),
          orderId: params.orderId,
          serviceType: "qrmakbara",
          amount: { value: String(params.amount), currency: "IQD" },
          ...(params.phone
            ? { customer: { phone: gatewayPhone(params.phone) } }
            : {}),
          redirectUrls: {
            successUrl: params.successUrl,
            failureUrl: params.failureUrl,
          },
        }),
        cache: "no-store",
      }
    );
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      redirectUrl?: string;
      transactionDetails?: { transactionId?: string };
    } | null;
    if (
      !res.ok ||
      json?.status !== "SUCCESS" ||
      !json.redirectUrl ||
      !json.transactionDetails?.transactionId
    ) {
      console.error("zaincash init failed", res.status, JSON.stringify(json));
      return null;
    }
    return {
      transactionId: json.transactionDetails.transactionId,
      redirectUrl: json.redirectUrl,
    };
  } catch (e) {
    console.error("zaincash init error", e);
    return null;
  }
}

/* ------------------------------ inquiry ------------------------------ */

export type ZcInquiry = {
  status: string;
  orderId: string | null;
  amount: number | null;
  currency: string | null;
};

/**
 * Asks the gateway about one transaction. Returns null when the transaction
 * is unknown or the call failed — both mean "not payable/not provable", so
 * callers must leave the order untouched.
 */
export async function zaincashInquiry(
  transactionId: string
): Promise<ZcInquiry | null> {
  if (!zaincashConfigured() || !transactionId) return null;
  try {
    const token = await accessToken();
    const res = await fetch(
      `${BASE}/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      err?: unknown;
      transactionDetails?: {
        orderId?: string;
        amount?: { value?: number; currency?: string };
      };
    } | null;
    // Unknown ids answer HTTP 200 with { err: … } and no details.
    if (!json || json.err || !json.transactionDetails) return null;
    return {
      status: String(json.status ?? ""),
      orderId: json.transactionDetails.orderId ?? null,
      amount: json.transactionDetails.amount?.value ?? null,
      currency: json.transactionDetails.amount?.currency ?? null,
    };
  } catch (e) {
    console.error("zaincash inquiry error", e);
    return null;
  }
}

/** Statuses the inquiry API uses once money has actually moved. */
export function isPaidStatus(status: string): boolean {
  const s = status.toUpperCase();
  return (
    s === "SUCCESS" ||
    s === "PAID" ||
    s === "COMPLETED" ||
    s.includes("SUCCESS")
  );
}

/* ---------------------------- confirmation ---------------------------- */

/**
 * Re-checks this order's transaction with the inquiry API and flips
 * pending → paid exactly once when — and only when — the gateway confirms
 * success for *this* order's id, amount and currency. A forged or replayed
 * reference therefore can never mark an order paid.
 */
export async function confirmZaincashOrder(order: Order): Promise<boolean> {
  if (order.status !== "pending" || order.payment_method !== "online") {
    return order.status === "paid";
  }
  if (!order.payment_ref) return false;

  const inq = await zaincashInquiry(order.payment_ref);
  if (!inq) return false;
  if (!isPaidStatus(inq.status)) return false;
  if (inq.orderId !== order.id) return false;
  if (Number(inq.amount) !== Number(order.amount)) return false;
  if (inq.currency !== order.currency) return false;

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
