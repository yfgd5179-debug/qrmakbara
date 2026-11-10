import { track } from "@vercel/analytics";

/** Values Vercel Web Analytics accepts as custom-event properties. */
export type EventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Queues a custom event for Vercel Web Analytics from the browser.
 *
 * The injected script keeps its own queue (`window.va`), so calling this
 * before the script loads — or while an ad-blocker eats it — is safe. Like
 * every analytics call in this app it never throws: measuring behaviour must
 * never break the flow being measured.
 */
export function trackEvent(name: string, properties?: EventProps): void {
  try {
    track(name, properties);
  } catch {
    // swallow — see doc comment
  }
}
