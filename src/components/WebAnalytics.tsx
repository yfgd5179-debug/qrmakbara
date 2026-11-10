"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics for the whole app.
 *
 * Lives in a tiny client component because `beforeSend` is a function and
 * functions cannot cross the server → client RSC boundary. The filter drops
 * page views of the admin panel so one operator's traffic never distorts the
 * "what do visitors do" reports. Custom funnel events are unaffected.
 *
 * Uses the `next` entry point (not `react`): it reads the App Router pathname
 * and params and reports the *route* (`/m/[slug]`, `/order/[id]`), so the
 * dashboard groups every memorial/order page into one row instead of listing
 * each slug separately.
 */
export function WebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (event.type === "pageview" && event.url.includes("/admin")) {
          return null;
        }
        return event;
      }}
    />
  );
}
