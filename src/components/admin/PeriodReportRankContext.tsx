"use client";

import { createContext, type ReactNode } from "react";

export const PeriodReportRankContext = createContext<string | undefined>(undefined);
export const PeriodReportDisplayContext = createContext<string | undefined>(undefined);

export function PeriodReportRankProvider({ label, description, children }: { label?: string; description?: string; children: ReactNode }) {
  return <PeriodReportRankContext.Provider value={label}>
    <PeriodReportDisplayContext.Provider value={description}>{children}</PeriodReportDisplayContext.Provider>
  </PeriodReportRankContext.Provider>;
}
