"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/admin/WeeklyReportClientTools";
import { WeeklyReportAiForm } from "@/components/admin/WeeklyReportAiForm";
import { buildWeeklyReportPrompt, type WeeklyReportAiJson } from "@/lib/weekly-report";
import { formatPercent } from "@/lib/utils";
import type { TierCandidate } from "@/lib/weekly-report-config";

const tierOptions: TierCandidate[] = ["Tier1", "Tier1.5", "Tier2", "Tier3", "評価保留"];

export function WeeklyReportAiWorkspace({
  aiJson,
  startDate,
  endDate,
  hasApiKey,
  tierOverrides,
  onTierChange
}: {
  aiJson: WeeklyReportAiJson;
  startDate: string;
  endDate: string;
  hasApiKey: boolean;
  tierOverrides: Record<string, TierCandidate>;
  onTierChange: (deckName: string, tier: TierCandidate) => void;
}) {
  const [operatorMemo, setOperatorMemo] = useState("");

  const adjustedAiJson = useMemo<WeeklyReportAiJson>(() => {
    const tierCandidates = aiJson.tierCandidates.map((row) => ({
      ...row,
      finalTier: tierOverrides[row.deckName] ?? row.finalTier
    }));

    return {
      ...aiJson,
      tierCandidates
    };
  }, [aiJson, tierOverrides]);

  const aiJsonText = useMemo(() => JSON.stringify(adjustedAiJson, null, 2), [adjustedAiJson]);
  const prompt = useMemo(() => buildWeeklyReportPrompt(adjustedAiJson, operatorMemo), [adjustedAiJson, operatorMemo]);

  return (
    <div className="grid gap-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-ink">Tier手動調整</h2>
        <p className="mt-1 text-sm text-muted">ここで選んだ最終TierはAI用JSONとプロンプトに反映します。DBには保存しません。</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {aiJson.tierCandidates.map((row) => (
            <label className="grid gap-1 rounded-md bg-slate-50 p-3 text-sm" key={row.deckName}>
              <span className="font-bold text-ink">{row.deckName}</span>
              <span className="text-xs text-muted">
                自動Tier候補: {row.suggestedTier}
              </span>
              <span className="text-xs text-muted">
                {row.matches}戦 / 勝率{formatPercent(row.winRate)}
              </span>
              <span className="text-xs text-muted">
                遭遇率{formatPercent(row.encounterShare)}（{row.opponentMatches}戦）
              </span>
              <span className="text-xs text-muted">
                主要対面勝率{formatPercent(row.weightedMajorMatchupWinRate)}
              </span>
              {row.warnings.length > 0 ? <span className="text-xs font-semibold text-amber-800">{row.warnings.join(" / ")}</span> : null}
              <span className="mt-1 text-xs font-bold text-ink">最終Tier</span>
              <select
                className="min-h-10 rounded-md border border-slate-300 bg-white px-2"
                value={tierOverrides[row.deckName] ?? row.finalTier}
                onChange={(event) => onTierChange(row.deckName, event.target.value as TierCandidate)}
              >
                {tierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-ink">運営者メモ</h2>
        <p className="mt-1 text-sm text-muted">統計データとは別の「運営者の所感」としてAIプロンプトへ追加します。</p>
        <textarea
          className="mt-3 min-h-28 w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-ink"
          onChange={(event) => setOperatorMemo(event.target.value)}
          placeholder="例: ランクマでもランプが増えた印象。AF対面では序盤の面処理が重要だと感じた。"
          value={operatorMemo}
        />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">AI用データ</h2>
            <p className="mt-1 text-sm text-muted">記事生成用に軽量化した集計済みJSONです。生の戦績行やユーザー識別情報は含みません。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={aiJsonText} label="AI用データをコピー" />
            <CopyButton text={prompt} label="AI用プロンプトをコピー" />
          </div>
        </div>
        <textarea className="mt-3 min-h-[260px] w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-5 text-ink" readOnly value={aiJsonText} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h2 className="font-bold text-ink">AIレポート</h2>
          <p className="mt-1 text-sm text-muted">
            APIキー未設定でもプロンプトコピーまでは利用できます。キー設定時だけサーバー側から本文生成します。
          </p>
        </div>
        <div className="mt-3">
          <WeeklyReportAiForm prompt={prompt} startDate={startDate} endDate={endDate} hasApiKey={hasApiKey} />
        </div>
      </section>
    </div>
  );
}
