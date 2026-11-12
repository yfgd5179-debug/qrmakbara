import { supabase } from "@/lib/db";
import { confirmQiCardOrder } from "@/lib/qicard";
import type { Order } from "@/lib/types";

/** Digs the gateway's payment id out of an arbitrarily nested payload. */
function findPaymentId(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPaymentId(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "paymentId" && typeof value === "string" && value) {
      return value;
    }
    const found = findPaymentId(value);
    if (found) return found;
  }
  return null;
}

/**
 * Status webhook from Qi Card (source of truth when the customer closes the
 * browser before being redirected back). The payload — including its
 * X-Signature, whose public key must still be requested from the gateway
 * team — is never trusted: it only points at a payment id, and
 * `confirmQiCardOrder` then re-asks the status API whether that payment
 * actually settled for this order's id/amount/currency.
 *
 * Always answers 200 for anything merely uninteresting (unparsable body,
 * unknown payment, already paid) so the gateway does not retry-storm us;
 * real infrastructure failures answer 500 and let it retry later.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: true, ignored: true });
  }

  const paymentId = findPaymentId(payload);
  if (!paymentId) return Response.json({ ok: true, ignored: true });

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("payment_ref", paymentId)
    .maybeSingle();
  if (error) return Response.json({ ok: false }, { status: 500 });
  if (!data) return Response.json({ ok: true, ignored: true });

  try {
    const paid = await confirmQiCardOrder(data as Order);
    return Response.json({ ok: true, paid });
  } catch (e) {
    console.error("qicard webhook confirm failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
