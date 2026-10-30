export type PaymentMethod = "cash" | "card" | "online";

/** Price of the metal plaque depending on where the customer is. */
export function priceFor(country: string): { amount: number; currency: string } {
  if (country === "IQ") return { amount: 75000, currency: "IQD" };
  return { amount: 20, currency: "USD" };
}

/**
 * Iraq: cash on delivery OR card.
 * Outside Iraq: online payment only.
 */
export function paymentMethods(country: string): PaymentMethod[] {
  return country === "IQ" ? ["cash", "card"] : ["online"];
}

export function formatPrice(amount: number, currency: string): string {
  const n = new Intl.NumberFormat("en-US").format(amount);
  return currency === "IQD" ? `${n} IQD` : `${currency} ${n}`;
}
