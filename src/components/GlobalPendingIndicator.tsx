"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PENDING_DELAY_MS = 80;
const SAFETY_TIMEOUT_MS = 8000;

export function GlobalPendingIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const showTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (showTimer.current) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }

      if (safetyTimer.current) {
        window.clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
    }

    function startPending() {
      clearTimers();
      showTimer.current = window.setTimeout(() => setPending(true), PENDING_DELAY_MS);
      safetyTimer.current = window.setTimeout(() => setPending(false), SAFETY_TIMEOUT_MS);
    }

    function isModifiedClick(event: MouseEvent) {
      return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target) {
        return;
      }

      const href = target.getAttribute("href");
      const targetAttr = target.getAttribute("target");
      if (!href || href.startsWith("#") || targetAttr === "_blank") {
        return;
      }

      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) {
        return;
      }

      startPending();
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) {
        return;
      }

      startPending();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      clearTimers();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  if (!pending) {
    return null;
  }

  return (
    <div aria-live="polite" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="h-1 overflow-hidden bg-slate-200">
        <div className="global-pending-bar h-full bg-ink" />
      </div>
      <div className="mx-auto flex max-w-7xl justify-end px-4 pt-3">
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm">
          <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-ink" />
          読み込み中
        </div>
      </div>
    </div>
  );
}
