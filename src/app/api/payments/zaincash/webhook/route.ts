import { supabase } from "@/lib/db";
import type { Order } from "@/lib/types";
import { confirmZaincashOrder } from "@/lib/zaincash";

/** Digs the gateway's transaction id out of an arbitrarily nested payload. */
function findTransactionId(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTransactionId(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "transactionId" && typeof value === "string" && value) {
      return value;
    }
    const found = findTransactionId(value);
    if (found) return found;
  }
  return null;
}

/**
 * Optional status webhook from ZainCash (source of truth when the customer
 * closes the browser before being redirected back). The payload is never
 * trusted: it only points at a transaction id, and `confirmZaincashOrder`
 * then re-asks the inquiry API whether that transaction actually settled for
 * this order's id/amount/currency.
 *
 * Always answers 200 for anything that is merely uninteresting (unknown
 * transaction, already paid) so the gateway does not retry-storm us; real
 * infrastructure failures answer 500 and let it retry later.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }

  const transactionId = findTransactionId(payload);
  if (!transactionId) return Response.json({ ok: true, ignored: true });

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("payment_ref", transactionId)
    .maybeSingle();
  if (error) return Response.json({ ok: false }, { status: 500 });
  if (!data) return Response.json({ ok: true, ignored: true });

  try {
    const paid = await confirmZaincashOrder(data as Order);
    return Response.json({ ok: true, paid });
  } catch (e) {
    console.error("zaincash webhook confirm failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
