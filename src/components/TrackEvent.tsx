"use client";

import { useEffect } from "react";
import { trackEvent, type EventProps } from "@/lib/analytics";

/**
 * Fires a one-shot custom event when a server page mounts — used by the
 * public memorial page, which has no client interaction of its own.
 * Page views are counted separately by Vercel Web Analytics; this adds the
 * structured properties (slug, owner) the reports filter on.
 */
export function TrackEvent({ name, props }: { name: string; props: EventProps }) {
  // Serialised so a re-render with a fresh object identity does not double-count.
  const key = JSON.stringify(props);
  useEffect(() => {
    trackEvent(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);
  return null;
}
