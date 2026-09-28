"use client";

import { useEffect, useMemo, useState } from "react";
import { isEnvironmentInputEnabled, nextEnvironmentInputBoundary } from "@/lib/environment-input";
import type { Environment } from "@/types/database";

export function useScheduledEnvironments(environments: Environment[], serverNow: number) {
  const [observedNow, setObservedNow] = useState(serverNow);
  const now = Math.max(serverNow, observedNow);
  const nextBoundary = nextEnvironmentInputBoundary(environments, now);

  useEffect(() => {
    if (nextBoundary === null) return;
    // Advance a server-provided timestamp with a monotonic elapsed duration.
    // Changing the device's wall clock cannot enable an environment early.
    const anchor = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    let updated = false;
    const check = () => {
      if (updated) return;
      clearTimeout(timer);
      const current = now + performance.now() - anchor;
      const remaining = nextBoundary - current;
      if (remaining <= 0) {
        updated = true;
        setObservedNow(current);
      } else {
        timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
      }
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [nextBoundary, now]);

  return useMemo(() => environments.filter(environment => isEnvironmentInputEnabled(environment, now)), [environments, now]);
}
