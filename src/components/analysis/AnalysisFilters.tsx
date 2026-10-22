import { AnalysisFilterPanel } from "./AnalysisFilterPanel";
import { DeckMultiSelectDialog } from "@/components/DeckMultiSelectDialog";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { getRankSelectionLabel, RANK_ATOMS, type RankSelection } from "@/lib/rank-selection";
import Link from "next/link";
import { AnalysisPeriodFields } from "@/components/analysis/AnalysisPeriodFields";
import { analysisPeriodLabel, type AnalysisPeriod } from "@/lib/analysis-presentation";
import { Button } from "@/components/Button";
import { FieldLabel, Select } from "@/components/Field";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import type { DeckLike } from "@/lib/analytics";
import type { WinRateMode } from "@/lib/match-perspectives";
import type { Environment, MatchResult, TurnOrder } from "@/types/database";

export type AnalysisFilterValues = {
  environmentId: string;
  myDeckIds?: readonly string[] | null;
  opponentDeckIds?: readonly string[] | null;
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

// These values describe the accepted result, never the editable form or popup draft.
export function summarizeAnalysisFilters(values: AnalysisFilterValues, decks: DeckLike[], environments: Pick<Environment, "id" | "name">[], periodPreset?: string, canUseAllUsers = false) {
  const deckLabel = (ids: readonly string[] | null | undefined, legacy: string) => {
    const selected = ids === undefined ? legacy ? [legacy] : null : ids;
    return !selected ? "すべて" : selected.length > 1 ? `${selected.length}デッキ`
      : decks.find(deck => deck.id === selected[0])?.name ?? "元のデッキ（現在選択肢なし）";
  };
  const ranks = getRankSelectionLabel(values.rankSelection ?? RANK_ATOMS);
  const period = analysisPeriodLabel(values.playedFrom, values.playedTo, periodPreset);
  return {
    scope: canUseAllUsers && values.scope === "all" ? "全ユーザー" : "自分のみ",
    mode: values.winRateMode === "combined" ? "反転込み" : "使用者側のみ",
    ranks: ranks === "すべて" ? "全ランク" : ranks,
    environment: environments.find(environment => environment.id === values.environmentId)?.name ?? "環境未選択",
    myDeck: deckLabel(values.myDeckIds, values.myDeckId), opponentDeck: deckLabel(values.opponentDeckIds, values.opponentDeckId),
    period: period === "カスタム期間" ? `${values.playedFrom.replace("T", " ") || "開始指定なし"} 〜 ${values.playedTo.replace("T", " ") || "終了指定なし"}（日本時間）` : period,
    turn: isTurnOrder(values.turnOrder) ? TURN_ORDER_LABELS[values.turnOrder] : "",
    result: isMatchResult(values.result) ? RESULT_LABELS[values.result] : ""
  };
}

export function AnalysisFilters({
  environments,
  decks,
  values,
  canUseAllUsers,
  pending = false,
  selectionRevision,
  onRankApply,
  onPeriodApply,
  periodPreset,
  onApply
}: {
  environments: Pick<Environment, "id" | "name">[];
  decks: DeckLike[];
  values: AnalysisFilterValues;
  canUseAllUsers?: boolean;
  pending?: boolean;
  selectionRevision?: object;
  onRankApply?: (ranks: RankSelection) => void;
  onPeriodApply?: (period: AnalysisPeriod, dates: { playedFrom: string; playedTo: string }) => void;
  periodPreset?: string;
  onApply?: (form: HTMLFormElement) => void;
}) {
  const summary = summarizeAnalysisFilters(values, decks, environments, periodPreset, canUseAllUsers);
  const scopeQuery = values.scope === "all" ? "&scope=all" : "";
  const resetHref = values.environmentId
    ? `/analysis?environment=${encodeURIComponent(values.environmentId)}${scopeQuery}`
    : values.scope === "all"
      ? "/analysis?scope=all"
      : "/analysis";

  return (
    <AnalysisFilterPanel summary={summary} canUseAllUsers={canUseAllUsers} pending={pending}
      selectionRevision={selectionRevision} onApply={onApply}>
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

        <DeckMultiSelectDialog label="使用デッキ" name="myDeck" decks={decks} value={values.myDeckIds === undefined ? values.myDeckId ? [values.myDeckId] : null : values.myDeckIds}
          disabled={pending} selectionRevision={selectionRevision} />

        <DeckMultiSelectDialog label="相手デッキ" name="opponentDeck" decks={decks} value={values.opponentDeckIds === undefined ? values.opponentDeckId ? [values.opponentDeckId] : null : values.opponentDeckIds}
          disabled={pending} selectionRevision={selectionRevision} />

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

        <AnalysisPeriodFields key={`${values.playedFrom}:${values.playedTo}:${periodPreset}`} from={values.playedFrom} to={values.playedTo}
          preset={periodPreset} pending={pending} onApply={onPeriodApply} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <Button className="min-w-24" type="submit">表示</Button>
        <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50" href={resetHref}>
          リセット
        </Link>
      </div>
    </AnalysisFilterPanel>
  );
}

export function isTurnOrder(value: string): value is TurnOrder {
  return value === "first" || value === "second";
}

export function isMatchResult(value: string): value is MatchResult {
  return value === "win" || value === "lose";
}
