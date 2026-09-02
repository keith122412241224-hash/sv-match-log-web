import { AlertTriangle } from "lucide-react";
import Image from "next/image";
import { classIconSrc, isShadowverseClass } from "@/components/ClassIcon";
import { ExportableReportBlock } from "@/components/admin/WeeklyReportClientTools";
import { WEEKLY_REPORT_CONFIG, type DataConfidence } from "@/lib/weekly-report-config";
import { cn, formatPercent } from "@/lib/utils";
import type { CorrelationEdge, MyDeckWinRateRow, OpponentDeckRankingRow, TierCandidateRow, UnifiedMatchupRow } from "@/lib/weekly-report";

const confidenceLabels: Record<DataConfidence, string> = {
  sufficient: "十分なサンプル",
  reference: "参考値",
  insufficient: "サンプル不足"
};

export function OpponentRankingChart({ rows }: { rows: OpponentDeckRankingRow[] }) {
  const maxMatches = Math.max(1, ...rows.map((row) => row.matches));

  if (rows.length === 0) {
    return <EmptyReportText>対象期間の戦績がありません。</EmptyReportText>;
  }

  return (
    <div className="grid gap-3">
      {rows.slice(0, 12).map((row) => (
        <div className="grid gap-1" key={row.deckId}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <ReportDeckLabel className={row.className} name={`${row.rank}. ${row.deckName}`} />
            <span className="shrink-0 font-semibold text-muted">
              {row.matches}戦 / {formatPercent(row.share)}
            </span>
          </div>
          <div className="h-8 rounded bg-slate-100">
            <div className="grid h-8 place-items-end rounded bg-cyan-600 px-2 text-right text-xs font-bold text-white" style={{ width: `${Math.max(4, (row.matches / maxMatches) * 100)}%` }}>
              {signedPercent(row.shareChange)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MyDeckWinRateChart({ rows }: { rows: MyDeckWinRateRow[] }) {
  const visible = rows.filter((row) => row.matches > 0).slice(0, 12);

  if (visible.length === 0) {
    return <EmptyReportText>対象期間の使用デッキ戦績がありません。</EmptyReportText>;
  }

  return (
    <div className="grid gap-3">
      {visible.map((row) => (
        <div className="grid gap-1" key={row.deckId}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <ReportDeckLabel className={row.className} name={`${row.rank}. ${row.deckName}`} />
            <span className="shrink-0 font-semibold text-muted">
              {formatPercent(row.winRate)} / {row.matches}戦
            </span>
          </div>
          <div className="relative h-8 rounded bg-slate-100">
            <div className="absolute left-1/2 top-0 h-8 w-px bg-slate-500" />
            <div
              className={cn("grid h-8 place-items-end rounded px-2 text-right text-xs font-bold text-white", row.isRankingEligible ? "bg-emerald-700" : "bg-amber-500")}
              style={{ width: `${Math.max(4, row.winRate ?? 0)}%` }}
            >
              {row.isRankingEligible ? signedPercent(row.winRateChange) : "少数"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeeklyReportTables({
  opponentRows,
  winRateRows,
  matchupRows,
  tierRows,
  correlationRows
}: {
  opponentRows: OpponentDeckRankingRow[];
  winRateRows: MyDeckWinRateRow[];
  matchupRows: UnifiedMatchupRow[];
  tierRows: TierCandidateRow[];
  correlationRows: CorrelationEdge[];
}) {
  return (
    <div className="grid gap-6">
      <ExportableReportBlock title="ランクマで多く当たったデッキ" fileName="weekly-opponent-ranking.png">
        <OpponentRankingChart rows={opponentRows} />
      </ExportableReportBlock>

      <ExportableReportBlock title="使用デッキ別勝率" fileName="weekly-my-deck-win-rate.png">
        <MyDeckWinRateChart rows={winRateRows} />
      </ExportableReportBlock>

      <ExportableReportBlock title="主要対面データ" fileName="weekly-matchups.png">
        <MatchupTable rows={matchupRows} />
      </ExportableReportBlock>

      <ExportableReportBlock title="Tier候補" fileName="weekly-tier-candidates.png">
        <TierTable rows={tierRows} />
      </ExportableReportBlock>

      <ExportableReportBlock title="環境相関図" fileName="weekly-correlation.png">
        <CorrelationGraph rows={correlationRows} />
      </ExportableReportBlock>
    </div>
  );
}

function MatchupTable({ rows }: { rows: UnifiedMatchupRow[] }) {
  const visible = rows.filter((row) => row.totalMatches >= WEEKLY_REPORT_CONFIG.majorMatchupMinMatches).slice(0, 30);

  if (visible.length === 0) {
    return <EmptyReportText>主要対面の条件を満たすデータがありません。</EmptyReportText>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-muted">
          <tr>
            <th className="px-3 py-2">デッキA</th>
            <th className="px-3 py-2">デッキB</th>
            <th className="px-3 py-2">試合数</th>
            <th className="px-3 py-2">A勝率</th>
            <th className="px-3 py-2">B勝率</th>
            <th className="px-3 py-2">信頼度</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr className="border-t border-slate-100" key={`${row.deckAId}-${row.deckBId}`}>
              <td className="px-3 py-2 font-semibold">{row.deckA}</td>
              <td className="px-3 py-2 font-semibold">{row.deckB}</td>
              <td className="px-3 py-2">{row.totalMatches}</td>
              <td className="px-3 py-2">{formatPercent(row.deckAWinRate)}</td>
              <td className="px-3 py-2">{formatPercent(row.deckBWinRate)}</td>
              <td className="px-3 py-2">{confidenceLabels[row.confidence]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TierTable({ rows }: { rows: TierCandidateRow[] }) {
  const tiers = ["Tier1", "Tier1.5", "Tier2", "Tier3", "評価保留"] as const;

  if (rows.length === 0) {
    return <EmptyReportText>Tier候補を作成できるデータがありません。</EmptyReportText>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {tiers.map((tier) => (
        <div className="rounded-md border border-slate-200" key={tier}>
          <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-ink">{tier}</h3>
          <div className="grid gap-2 p-3">
            {rows.filter((row) => row.finalTier === tier).map((row) => (
              <div className="rounded bg-white text-sm" key={row.deckId}>
                <div className="font-bold text-ink">{row.deckName}</div>
                <div className="text-xs text-muted">
                  最終Tier: {row.finalTier}
                </div>
                {row.finalTier !== row.suggestedTier ? (
                  <div className="text-xs font-semibold text-amber-800">自動Tier候補: {row.suggestedTier}</div>
                ) : null}
                <div className="text-xs text-muted">
                  {row.matches}戦 / 勝率{formatPercent(row.winRate)}
                </div>
                <div className="text-xs text-muted">
                  遭遇率{formatPercent(row.encounterShare)}（{row.opponentMatches}戦）
                </div>
                <div className="text-xs text-muted">
                  主要対面勝率{formatPercent(row.weightedMajorMatchupWinRate)}
                </div>
                {row.warnings.length > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} aria-hidden="true" />
                    {row.warnings.join(" / ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CorrelationGraph({ rows }: { rows: CorrelationEdge[] }) {
  if (rows.length === 0) {
    return <EmptyReportText>相関図条件を満たす対面がありません。</EmptyReportText>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.slice(0, 16).map((row, index) => (
        <div
          className={cn(
            "grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm",
            row.isReferenceValue ? "border-dashed border-amber-300" : "border-solid border-slate-200"
          )}
          key={`${row.advantagedDeck}-${row.disadvantagedDeck}-${index}`}
        >
          <div className="font-bold text-emerald-800">{row.advantagedDeck}</div>
          <div className="text-center">
            <div className="text-lg font-black text-ink">→</div>
            <div className="text-xs font-semibold text-muted">
              {formatPercent(row.winRate)} / {row.matches}戦
            </div>
          </div>
          <div className="font-bold text-red-800">{row.disadvantagedDeck}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyReportText({ children }: { children: string }) {
  return <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-muted">{children}</p>;
}

function ReportDeckLabel({ className, name }: { className: string; name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {isShadowverseClass(className) ? (
        <Image
          alt={className}
          className="shrink-0 rounded-full"
          height={24}
          src={classIconSrc(className)}
          unoptimized
          width={24}
        />
      ) : null}
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}

function signedPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%pt`;
}
