"use client";

import { useMemo, useState } from "react";
import { WeeklyReportAiWorkspace } from "@/components/admin/WeeklyReportAiWorkspace";
import { WeeklyReportTables } from "@/components/admin/WeeklyReportViews";
import type {
  CorrelationEdge,
  MyDeckWinRateRow,
  OpponentDeckRankingRow,
  TierCandidateRow,
  UnifiedMatchupRow,
  WeeklyReportAiJson
} from "@/lib/weekly-report";
import type { TierCandidate } from "@/lib/weekly-report-config";

export function WeeklyReportInteractiveSections({
  opponentRows,
  winRateRows,
  matchupRows,
  tierRows,
  correlationRows,
  aiJson,
  startDate,
  endDate,
  hasApiKey
}: {
  opponentRows: OpponentDeckRankingRow[];
  winRateRows: MyDeckWinRateRow[];
  matchupRows: UnifiedMatchupRow[];
  tierRows: TierCandidateRow[];
  correlationRows: CorrelationEdge[];
  aiJson: WeeklyReportAiJson;
  startDate: string;
  endDate: string;
  hasApiKey: boolean;
}) {
  const [tierOverrides, setTierOverrides] = useState<Record<string, TierCandidate>>({});
  const adjustedTierRows = useMemo(
    () =>
      tierRows.map((row) => ({
        ...row,
        finalTier: tierOverrides[row.deckName] ?? row.finalTier
      })),
    [tierOverrides, tierRows]
  );

  return (
    <>
      <WeeklyReportTables
        opponentRows={opponentRows}
        winRateRows={winRateRows}
        matchupRows={matchupRows}
        tierRows={adjustedTierRows}
        correlationRows={correlationRows}
      />

      <WeeklyReportAiWorkspace
        aiJson={aiJson}
        startDate={startDate}
        endDate={endDate}
        hasApiKey={hasApiKey}
        tierOverrides={tierOverrides}
        onTierChange={(deckName, tier) =>
          setTierOverrides((current) => ({
            ...current,
            [deckName]: tier
          }))
        }
      />
    </>
  );
}
