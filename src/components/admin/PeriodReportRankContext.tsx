"use client";

import { createContext, type ReactNode } from "react";

export const PeriodReportRankContext = createContext<string | undefined>(undefined);

export function PeriodReportRankProvider({ label, children }: { label?: string; children: ReactNode }) {
  return <PeriodReportRankContext.Provider value={label}>{children}</PeriodReportRankContext.Provider>;
}
