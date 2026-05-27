"use client";

import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createMatch } from "@/app/actions";
import { Button } from "@/components/Button";
import { ClassIcon, DeckWithClassIcon } from "@/components/ClassIcon";
import { FieldLabel, Input, Select, Textarea } from "@/components/Field";
import { RESULT_LABELS, SHADOWVERSE_CLASSES, TURN_ORDER_LABELS } from "@/lib/constants";
import { cn, toDatetimeLocalValue } from "@/lib/utils";
import type { Deck, DeckArchetype, Environment, MatchResult, TurnOrder } from "@/types/database";

const LAST_MY_CHOICE_KEY = "svml:last-my-choice-id";
const LAST_ENVIRONMENT_KEY = "svml:last-environment-id";

type DeckChoice = {
  id: string;
  name: string;
  class_name: string;
  source: "deck" | "archetype";
};

export type GuestMatchDraft = {
  environment_id: string;
  my_deck_id: string;
  opponent_deck_id: string;
  my_archetype_id: string | null;
  opponent_archetype_id: string | null;
  turn_order: TurnOrder;
  result: MatchResult;
  played_at: string;
  memo: string | null;
};

export function QuickMatchForm({
  decks,
  environments,
  archetypes = [],
  saved,
  guest = false,
  onGuestSubmit
}: {
  decks: Deck[];
  environments: Environment[];
  archetypes?: DeckArchetype[];
  saved?: boolean;
  guest?: boolean;
  onGuestSubmit?: (match: GuestMatchDraft) => void;
}) {
  const myChoices: DeckChoice[] = useMemo(() => {
    if (archetypes.length > 0) {
      return archetypes.map((archetype) => ({
        id: archetype.id,
        name: archetype.name,
        class_name: archetype.class_name,
        source: "archetype"
      }));
    }

    return decks.map((deck) => ({ id: deck.id, name: deck.name, class_name: deck.class_name, source: "deck" }));
  }, [archetypes, decks]);

  const [myChoiceId, setMyChoiceId] = useState(myChoices[0]?.id ?? "");
  const [opponentDeckId, setOpponentDeckId] = useState(decks[0]?.id ?? "");
  const [opponentArchetypeId, setOpponentArchetypeId] = useState(archetypes[0]?.id ?? "");
  const [opponentClass, setOpponentClass] = useState(archetypes[0]?.class_name ?? SHADOWVERSE_CLASSES[0]);
  const [turnOrder, setTurnOrder] = useState<TurnOrder>("first");
  const [result, setResult] = useState<MatchResult>("win");
  const [playedAt, setPlayedAt] = useState(toDatetimeLocalValue());
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_MY_CHOICE_KEY);
    if (stored && myChoices.some((choice) => choice.id === stored)) {
      setMyChoiceId(stored);
    } else if (myChoices[0]) {
      setMyChoiceId(myChoices[0].id);
    }
  }, [myChoices]);

  useEffect(() => {
    if (myChoiceId) {
      window.localStorage.setItem(LAST_MY_CHOICE_KEY, myChoiceId);
    }
  }, [myChoiceId]);

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_ENVIRONMENT_KEY);
    if (stored && environments.some((environment) => environment.id === stored)) {
      setEnvironmentId(stored);
    } else if (environments[0]) {
      setEnvironmentId(environments[0].id);
    }
  }, [environments]);

  useEffect(() => {
    if (environmentId) {
      window.localStorage.setItem(LAST_ENVIRONMENT_KEY, environmentId);
    }
  }, [environmentId]);

  const selectedMyChoice = useMemo(() => myChoices.find((choice) => choice.id === myChoiceId), [myChoices, myChoiceId]);
  const classArchetypes = useMemo(
    () => archetypes.filter((archetype) => archetype.class_name === opponentClass),
    [archetypes, opponentClass]
  );
  const usesArchetypes = archetypes.length > 0;
  const selectedOpponentDeckId = usesArchetypes ? opponentArchetypeId : opponentDeckId;

  function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guest) {
      return;
    }

    event.preventDefault();
    if (!selectedMyChoice || !environmentId || !selectedOpponentDeckId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const memo = String(formData.get("memo") ?? "").trim();
    onGuestSubmit?.({
      environment_id: environmentId,
      my_deck_id: selectedMyChoice.id,
      opponent_deck_id: selectedOpponentDeckId,
      my_archetype_id: selectedMyChoice.id,
      opponent_archetype_id: usesArchetypes ? selectedOpponentDeckId : null,
      turn_order: turnOrder,
      result,
      played_at: playedAt ? new Date(playedAt).toISOString() : new Date().toISOString(),
      memo: memo || null
    });
  }

  return (
    <form
      action={guest ? undefined : createMatch}
      className="grid gap-4 rounded-md border border-slate-200 bg-white p-4"
      onSubmit={guest ? handleGuestSubmit : undefined}
    >
      {saved || guest ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {guest ? "ゲスト体験中です。入力操作だけ確認できます。" : "保存しました。続けて入力できます。"}
        </p>
      ) : null}

      {selectedMyChoice?.source === "deck" ? (
        <input name="my_deck_id" type="hidden" value={selectedMyChoice.id} />
      ) : (
        <input name="my_archetype_id" type="hidden" value={selectedMyChoice?.id ?? ""} />
      )}

      <FieldLabel>
        環境
        <Select required name="environment_id" value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </Select>
      </FieldLabel>

      <FieldLabel>
        使用デッキ
        <Select required value={myChoiceId} onChange={(event) => setMyChoiceId(event.target.value)}>
          {myChoices.map((choice) => (
            <option key={`${choice.source}-${choice.id}`} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </Select>
      </FieldLabel>

      {selectedMyChoice ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          前回選択はこの端末に記憶されます。
          <DeckWithClassIcon className={selectedMyChoice.class_name} compact name={selectedMyChoice.name} />
        </p>
      ) : null}

      <section className="grid gap-2">
        <div className="text-sm font-semibold text-ink">相手デッキ</div>
        {usesArchetypes ? (
          <>
            <input name="opponent_archetype_id" type="hidden" value={opponentArchetypeId} />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {SHADOWVERSE_CLASSES.map((className) => (
                <button
                  className={cn("grid min-h-12 place-items-center rounded-md border", opponentClass === className ? "border-ink ring-2 ring-slate-300" : "border-slate-300")}
                  key={className}
                  onClick={() => {
                    setOpponentClass(className);
                    const next = archetypes.find((archetype) => archetype.class_name === className);
                    if (next) {
                      setOpponentArchetypeId(next.id);
                    }
                  }}
                  title={className}
                  type="button"
                >
                  <ClassIcon className={className} size={30} />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {classArchetypes.map((archetype) => (
                <button
                  className={cn(
                    "min-h-14 rounded-md border px-3 py-2 text-left text-sm font-semibold",
                    opponentArchetypeId === archetype.id ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-ink"
                  )}
                  key={archetype.id}
                  onClick={() => setOpponentArchetypeId(archetype.id)}
                  type="button"
                >
                  {archetype.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <input name="opponent_deck_id" type="hidden" value={opponentDeckId} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {decks.map((deck) => (
                <button
                  className={cn(
                    "min-h-16 rounded-md border px-3 py-2 text-left text-sm font-semibold",
                    opponentDeckId === deck.id ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-ink"
                  )}
                  key={deck.id}
                  onClick={() => setOpponentDeckId(deck.id)}
                  type="button"
                >
                  <span className="block">{deck.name}</span>
                  <span className={cn("mt-1 inline-flex", opponentDeckId === deck.id ? "opacity-90" : "opacity-80")}>
                    <ClassIcon className={deck.class_name} size={24} />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-2">
        <div className="text-sm font-semibold text-ink">先攻/後攻</div>
        <input name="turn_order" type="hidden" value={turnOrder} />
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TURN_ORDER_LABELS).map(([value, label]) => (
            <button
              className={cn("min-h-12 rounded-md border text-sm font-bold", turnOrder === value ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-ink")}
              key={value}
              onClick={() => setTurnOrder(value as TurnOrder)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <div className="text-sm font-semibold text-ink">勝敗</div>
        <input name="result" type="hidden" value={result} />
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(RESULT_LABELS).map(([value, label]) => (
            <button
              className={cn(
                "min-h-12 rounded-md border text-sm font-bold",
                result === value && value === "win" && "border-emerald-700 bg-emerald-700 text-white",
                result === value && value === "lose" && "border-red-700 bg-red-700 text-white",
                result !== value && "border-slate-300 bg-white text-ink"
              )}
              key={value}
              onClick={() => setResult(value as MatchResult)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <FieldLabel>
        対戦日時
        <Input name="played_at" type="datetime-local" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} />
      </FieldLabel>

      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">メモを入力する</summary>
        <div className="mt-3">
          <Textarea name="memo" placeholder="キープ、負け筋、印象など" />
        </div>
      </details>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button name="next_action" type="submit" value="continue">
          <Save size={17} aria-hidden="true" />
          {guest ? "入力を試す" : "保存して続ける"}
        </Button>
        <Button className={guest ? "hidden" : undefined} name="next_action" type="submit" value="home" variant="secondary">
          保存してホームへ
        </Button>
      </div>
    </form>
  );
}
