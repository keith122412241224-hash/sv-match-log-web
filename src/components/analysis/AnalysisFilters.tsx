import { RankMultiSelect } from "@/components/RankMultiSelect";
import { RANK_ATOMS, type RankSelection } from "@/lib/rank-selection";
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
  rankSelection?: RankSelection;
};

export function AnalysisFilters({
  environments,
  decks,
  values,
  canUseAllUsers,
  pending = false,
  onRankApply
}: {
  environments: Pick<Environment, "id" | "name">[];
  decks: DeckLike[];
  values: AnalysisFilterValues;
  canUseAllUsers?: boolean;
  pending?: boolean;
  onRankApply?: (ranks: RankSelection) => void;
}) {
  const scopeQuery = values.scope === "all" ? "&scope=all" : "";
  const resetHref = values.environmentId
    ? `/analysis?environment=${encodeURIComponent(values.environmentId)}${scopeQuery}`
    : values.scope === "all"
      ? "/analysis?scope=all"
      : "/analysis";

  return (
    <form action="/analysis" aria-busy={pending || undefined}
      onSubmit={e => { if (pending) e.preventDefault(); }}
      onPointerDownCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onClickCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onChangeCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onKeyDownCapture={e => { if (pending && e.key !== "Tab") { e.preventDefault(); e.stopPropagation(); } }}
      className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FieldLabel>
          勝率集計
          <Select name="winRateMode" defaultValue={values.winRateMode}>
            <option value="direct">使用者側のみ</option>
            <option value="combined">対戦相手反転込み</option>
          </Select>
        </FieldLabel>
        <div className="min-w-0"><RankMultiSelect label="登録者のランク" value={values.rankSelection ?? RANK_ATOMS} disabled={pending} onApply={ranks => onRankApply?.(ranks)} /><p className="mt-1 text-xs text-muted">登録者の対戦時点のランクで絞ります。反転込みでもランクは変わりません。</p></div>
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

      </div>

      <div className="mt-3 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
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
