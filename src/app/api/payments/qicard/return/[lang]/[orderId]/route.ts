import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/db";
import { hasLocale } from "@/lib/dict";
import { confirmQiCardOrder, qiConfigured } from "@/lib/qicard";
import type { Order } from "@/lib/types";

/**
 * Where Qi Card sends the browser after the hosted 3D Secure form — on both
 * success and failure (the same URL is registered for both). Whatever the
 * gateway appends to the query is deliberately ignored: we re-check the
 * payment with the status API instead, and only a gateway-confirmed match
 * for this order's id/amount/currency flips it to paid. A cancelled or
 * failed payment simply lands on the order page still pending, with the
 * "Pay now" button intact.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ lang: string; orderId: string }> }
) {
  const { lang, orderId } = await ctx.params;
  const target = hasLocale(lang) ? lang : "ar";
  const back = new URL(`/${target}/order/${orderId}`, request.url);

  if (qiConfigured() && /^[A-Za-z0-9-]{6,64}$/.test(orderId)) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    const order = data as Order | null;
    if (order && order.payment_method === "card" && order.status === "pending") {
      try {
        await confirmQiCardOrder(order);
      } catch (e) {
        // Never fail the redirect over a confirmation hiccup — the webhook
        // (or the customer's next visit) still gets a chance.
        console.error("qicard return confirm failed", e);
      }
    }
  }

  return NextResponse.redirect(back);
}
