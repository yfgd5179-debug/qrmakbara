export type PaymentMethod = "cash" | "card" | "online";

/** Localized label for an order status (shared by dashboard/order/admin). */
export function orderStatusLabel(
  status: string,
  admin: {
    pending: string;
    paid: string;
    shipped: string;
    delivered: string;
    cancelled: string;
  }
): string {
  switch (status) {
    case "paid":
      return admin.paid;
    case "shipped":
      return admin.shipped;
    case "delivered":
      return admin.delivered;
    case "cancelled":
      return admin.cancelled;
    default:
      return admin.pending;
  }
}

/** Tailwind badge classes for an order status. */
export function orderStatusBadge(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-300";
    case "shipped":
      return "bg-sky-500/15 text-sky-300";
    case "delivered":
      return "bg-indigo-500/15 text-indigo-300";
    case "cancelled":
      return "bg-rose-500/15 text-rose-300";
    default:
      return "bg-amber-500/15 text-amber-300";
  }
}

/** Price of the metal plaque depending on where the customer is. */
export function priceFor(country: string): { amount: number; currency: string } {
  if (country === "IQ") return { amount: 75000, currency: "IQD" };
  return { amount: 20, currency: "USD" };
}

/**
 * Master switch for gateway payments (ZainCash + Qi Card).
 *
 * Flipped to `false` while the live gateway credentials are being
 * onboarded: checkout then offers cash on delivery only, and the pending
 * order page stops showing the "Pay now" buttons. Everything downstream —
 * `src/lib/zaincash.ts`, `src/lib/qicard.ts`, the return/webhook routes,
 * the env variables — stays in place, so flipping this back to `true`
 * re-enables online payment with no other change.
 */
export const ONLINE_PAYMENTS_ENABLED = false;

/**
 * Iraq: cash on delivery; when ONLINE_PAYMENTS_ENABLED, additionally online
 * payment through the ZainCash gateway and a Qi Card payment (both IQD).
 * Outside Iraq: cash as well, with the gateways (IQD only) available behind
 * the same switch.
 */
export function paymentMethods(country: string): PaymentMethod[] {
  if (!ONLINE_PAYMENTS_ENABLED) return ["cash"];
  return country === "IQ" ? ["cash", "online", "card"] : ["online"];
}

export function formatPrice(amount: number, currency: string): string {
  const n = new Intl.NumberFormat("en-US").format(amount);
  return currency === "IQD" ? `${n} IQD` : `${currency} ${n}`;
}
