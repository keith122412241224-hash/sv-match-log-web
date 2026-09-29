import { ANALYSIS_RANK_FILTERS, type AnalysisRankFilter } from "@/lib/analysis-rank-filter";
import Link from "next/link";
import { AnalysisDateTimeField } from "@/components/analysis/AnalysisDateTimeField";
import { Button } from "@/components/Button";
import { FieldLabel, Select } from "@/components/Field";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import type { DeckLike } from "@/lib/analytics";
import type { WinRateMode } from "@/lib/match-perspectives";
import type { Environment, MatchResult, TurnOrder } from "@/types/database";

export type AnalysisFilterValues = {
  environmentId: string;
  myDeckId: string;
  opponentDeckId: string;
  turnOrder: string;
  result: string;
  playedFrom: string;
  playedTo: string;
  scope: string;
  winRateMode: WinRateMode;
  rankFilter?: AnalysisRankFilter;
};

export function AnalysisFilters({
  environments,
  decks,
  values,
  canUseAllUsers
}: {
  environments: Environment[];
  decks: DeckLike[];
  values: AnalysisFilterValues;
  canUseAllUsers?: boolean;
}) {
  const scopeQuery = values.scope === "all" ? "&scope=all" : "";
  const resetHref = values.environmentId
    ? `/analysis?environment=${encodeURIComponent(values.environmentId)}${scopeQuery}`
    : values.scope === "all"
      ? "/analysis?scope=all"
      : "/analysis";

  return (
    <form action="/analysis" className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
        <FieldLabel>
          勝率集計
          <Select name="winRateMode" defaultValue={values.winRateMode}>
            <option value="direct">使用者側のみ</option>
            <option value="combined">対戦相手反転込み</option>
          </Select>
        </FieldLabel>
        <div className="grid gap-1.5 text-sm font-semibold text-ink">
          <div className="flex items-center gap-1">
            <label htmlFor="analysis-rank">登録者のランク</label>
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label="登録者のランクについて"
                aria-describedby="analysis-rank-help"
                className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <span aria-hidden="true">ⓘ</span>
              </button>
              <span
                id="analysis-rank-help"
                role="tooltip"
                className="invisible absolute -left-28 top-full z-30 w-64 max-w-[calc(100vw-3rem)] pt-2 opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                <span className="block rounded-md bg-ink p-3 text-xs font-normal leading-relaxed text-white shadow-lg">
                  登録者の対戦時点のランクで絞ります。反転込みでもランクは変わりません。
                </span>
              </span>
            </span>
          </div>
          <Select id="analysis-rank" key={values.rankFilter ?? "all"} name="rank" defaultValue={values.rankFilter ?? "all"}>
            {ANALYSIS_RANK_FILTERS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
        {canUseAllUsers ? (
          <FieldLabel>
            集計範囲
            <Select name="scope" defaultValue={values.scope}>
              <option value="mine">自分のみ</option>
              <option value="all">全ユーザー</option>
            </Select>
          </FieldLabel>
        ) : <div className="hidden xl:block" aria-hidden="true" />}

        <FieldLabel>
          表示する環境
          <Select name="environment" defaultValue={values.environmentId}>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </Select>
        </FieldLabel>

        <FieldLabel>
          使用デッキ
          <Select name="myDeck" defaultValue={values.myDeckId}>
            <option value="">すべて</option>
            {decks.map((deck) => (
              <option key={`my-${deck.id}`} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </Select>
        </FieldLabel>

        <FieldLabel>
          相手デッキ
          <Select name="opponentDeck" defaultValue={values.opponentDeckId}>
            <option value="">すべて</option>
            {decks.map((deck) => (
              <option key={`opponent-${deck.id}`} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </Select>
        </FieldLabel>

        <FieldLabel>
          先後
          <Select name="turnOrder" defaultValue={values.turnOrder}>
            <option value="">すべて</option>
            {Object.entries(TURN_ORDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldLabel>

        <FieldLabel>
          結果
          <Select name="result" defaultValue={values.result}>
            <option value="">すべて</option>
            {Object.entries(RESULT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldLabel>

        <fieldset className="min-w-0 md:col-span-2 xl:col-span-1">
          <legend className="mb-1.5 text-sm font-semibold text-ink">期間（日本時間）</legend>
          {/* Keep the date fields intact; only adapt their layout within this period group. */}
          <div className="flex flex-wrap items-center gap-2 [&_fieldset]:flex-[1_1_15.5rem] [&_fieldset>div]:grid-cols-[minmax(0,1fr)_6.5rem] [&_legend]:sr-only">
            <AnalysisDateTimeField
              key={`playedFrom:${values.playedFrom}`}
              name="playedFrom"
              label="開始日時"
              value={values.playedFrom}
              defaultTime="00:00"
            />
            <div className="flex min-w-0 flex-[1_1_17rem] items-center gap-2">
              <span className="shrink-0 text-muted" aria-hidden="true">～</span>
              <AnalysisDateTimeField
                key={`playedTo:${values.playedTo}`}
                name="playedTo"
                label="終了日時"
                value={values.playedTo}
                defaultTime="23:59"
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <Button className="min-w-24" type="submit">表示</Button>
        <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50" href={resetHref}>
          リセット
        </Link>
      </div>
    </form>
  );
}

export function isTurnOrder(value: string): value is TurnOrder {
  return value === "first" || value === "second";
}

export function isMatchResult(value: string): value is MatchResult {
  return value === "win" || value === "lose";
}
