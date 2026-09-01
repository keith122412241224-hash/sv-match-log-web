import Link from "next/link";
import { Button } from "@/components/Button";
import { FieldLabel, Input, Select } from "@/components/Field";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import type { DeckLike } from "@/lib/analytics";
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[1fr_1.1fr_1fr_1fr_0.85fr_0.85fr_0.95fr_0.95fr_auto_auto] 2xl:items-end">
        {canUseAllUsers ? (
          <FieldLabel>
            集計範囲
            <Select name="scope" defaultValue={values.scope}>
              <option value="mine">自分のみ</option>
              <option value="all">全ユーザー</option>
            </Select>
          </FieldLabel>
        ) : null}

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

        <FieldLabel>
          開始日時
          <Input name="playedFrom" type="datetime-local" defaultValue={values.playedFrom} />
        </FieldLabel>

        <FieldLabel>
          終了日時
          <Input name="playedTo" type="datetime-local" defaultValue={values.playedTo} />
        </FieldLabel>

        <Button type="submit">表示</Button>
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
