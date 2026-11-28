"use client";

import { Analytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics";

// Only fixed navigation paths are useful for aggregate traffic statistics.
const measuredPaths = new Set(["/", "/guide", "/guest", "/privacy", "/terms", "/matches", "/decks", "/analysis", "/matrix", "/environment"]);

export function filterPageview(event: BeforeSendEvent) {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (url.origin !== window.location.origin || !measuredPaths.has(url.pathname)) return null;
    // The analytics script adds document.referrer separately after beforeSend.
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (!["https:", "http:"].includes(ref.protocol) || ref.username || ref.password || ref.search || ref.hash) return null;
      if (ref.origin !== url.origin && ref.pathname !== "/") return null;
    }
    return { type: event.type, url: url.origin + url.pathname };
  } catch {
    return null;
  }
}

export function SiteAnalytics() {
  return <Analytics beforeSend={filterPageview} />;
}
