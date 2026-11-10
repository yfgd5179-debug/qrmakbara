import { track } from "@vercel/analytics/server";
import { headers } from "next/headers";

/** Values Vercel Web Analytics accepts as custom-event properties. */
export type EventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Records a custom event from a server action.
 *
 * Funnel outcomes (login ok? code valid? order stored?) are only known on
 * the server, so the success/error half of every funnel is tracked here and
 * the view/submit half in the client components. `headers()` is forwarded so
 * the SDK can attribute the event to the same visitor/session as the page
 * views. Best-effort by design: any failure is swallowed so analytics can
 * never break the action it is measuring.
 */
export async function trackEvent(
  name: string,
  properties?: EventProps
): Promise<void> {
  try {
    await track(name, properties, { headers: await headers() });
  } catch {
    // swallow — see doc comment
  }
}
