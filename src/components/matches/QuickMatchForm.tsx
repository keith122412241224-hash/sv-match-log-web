"use client";

import { Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { FormEvent } from "react";
import { createMatch, createMatchInline } from "@/app/actions";
import { RankFields } from "@/components/matches/RankFields";
import { SaveToast, type SaveNotification } from "@/components/SaveToast";
import { lastRankKey, readLastRank, rememberLastRank } from "@/lib/match-rank-preference";
import { safeGetItem, safeSetItem } from "@/lib/browser-preferences";
import { EMPTY_RANK, validateMatchRank, type MatchRank } from "@/lib/match-rank";
import { isEnvironmentInputEnabled } from "@/lib/environment-input";
import type { MatchEditData, MatchMutationResult } from "@/lib/match-edit";
import { Button } from "@/components/Button";
import { notifyNavigationStart } from "@/components/GlobalPendingIndicator";
import { ClassIcon, DeckWithClassIcon } from "@/components/ClassIcon";
import { FieldLabel, Select } from "@/components/Field";
import { RESULT_LABELS, SHADOWVERSE_CLASSES, TURN_ORDER_LABELS } from "@/lib/constants";
import { cn, getMostRecentlyCreatedId } from "@/lib/utils";
import type { Deck, DeckArchetype, Environment, MatchResult, TurnOrder } from "@/types/database";

const LAST_MY_CHOICE_KEY = "svml:last-my-choice-id";
const LAST_ENVIRONMENT_KEY = "svml:last-environment-id";

type DeckChoice = {
  id: string;
  name: string;
  class_name: string;
  source: "deck" | "archetype";
};

export type GuestMatchDraft = MatchRank & {
  environment_id: string;
  my_deck_id: string;
  opponent_deck_id: string;
  my_archetype_id: string | null;
  opponent_archetype_id: string | null;
  turn_order: TurnOrder;
  result: MatchResult;
  played_at: string;
};

export function QuickMatchForm({
  decks,
  environments,
  archetypes = [],
  saved,
  error,
  guest = false,
  userId,
  onGuestSubmit,
  initialMatch,
  onEditSubmit,
  onCancel,
  onPendingChange
}: {
  decks: Deck[];
  environments: Environment[];
  archetypes?: DeckArchetype[];
  saved?: boolean;
  error?: string;
  guest?: boolean;
  userId?: string;
  onGuestSubmit?: (match: GuestMatchDraft) => { ok: boolean; message?: string };
  initialMatch?: MatchEditData["match"];
  onEditSubmit?: (form: FormData, draft: GuestMatchDraft) => Promise<MatchMutationResult>;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const myChoices: DeckChoice[] = useMemo(() => {
    if (archetypes.length > 0) {
      const choices: DeckChoice[] = archetypes.map((archetype) => ({
        id: archetype.id,
        name: archetype.name,
        class_name: archetype.class_name,
        source: "archetype"
      }));
      const legacy = initialMatch && !initialMatch.my_archetype_id ? decks.find(deck => deck.id === initialMatch.my_deck_id) : null;
      if (legacy) choices.push({ ...legacy, source: "deck" });
      if (initialMatch && !choices.some(choice => choice.id === (initialMatch.my_archetype_id ?? initialMatch.my_deck_id))) {
        choices.push({ id: initialMatch.my_archetype_id ?? initialMatch.my_deck_id, name: "元の使用デッキ（現在選択肢なし）", class_name: "", source: initialMatch.my_archetype_id ? "archetype" : "deck" });
      }
      return choices;
    }

    return decks.map((deck) => ({ id: deck.id, name: deck.name, class_name: deck.class_name, source: "deck" }));
  }, [archetypes, decks, initialMatch]);

  const [myChoiceId, setMyChoiceId] = useState(initialMatch ? initialMatch.my_archetype_id ?? initialMatch.my_deck_id : myChoices[0]?.id ?? "");
  const [opponentDeckId, setOpponentDeckId] = useState(initialMatch?.opponent_deck_id ?? decks[0]?.id ?? "");
  const [opponentArchetypeId, setOpponentArchetypeId] = useState(initialMatch ? initialMatch.opponent_archetype_id ?? "" : archetypes[0]?.id ?? "");
  const [opponentClass, setOpponentClass] = useState((initialMatch ? archetypes.find(row => row.id === initialMatch.opponent_archetype_id)?.class_name : archetypes[0]?.class_name) ?? SHADOWVERSE_CLASSES[0]);
  const [turnOrder, setTurnOrder] = useState<TurnOrder>(initialMatch?.turn_order ?? "first");
  const [result, setResult] = useState<MatchResult>(initialMatch?.result ?? "win");
  const [environmentId, setEnvironmentId] = useState(initialMatch?.environment_id ?? getMostRecentlyCreatedId(environments));
  const [rank, setRank] = useState<MatchRank>(initialMatch ? { rank_tier: initialMatch.rank_tier ?? null, master_group: initialMatch.master_group ?? null, grandmaster_rating: initialMatch.grandmaster_rating ?? null } : { ...EMPTY_RANK });
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const notificationId = useRef(0);
  const [notification, setNotification] = useState<SaveNotification | null>(null);
  const dismissNotification = useCallback(() => setNotification(null), []);
  const rankKey = lastRankKey(userId, guest);
  useEffect(() => { if (!initialMatch) setRank(readLastRank(rankKey)); }, [rankKey, initialMatch]);
  function notify(kind: SaveNotification["kind"]) {
    setNotification({ id: ++notificationId.current, kind });
  }

  useEffect(() => {
    if (initialMatch) return;
    const stored = safeGetItem(LAST_MY_CHOICE_KEY);
    if (stored && myChoices.some((choice) => choice.id === stored)) {
      setMyChoiceId(stored);
    } else if (myChoices[0]) {
      setMyChoiceId(myChoices[0].id);
    }
  }, [myChoices, initialMatch]);

  useEffect(() => {
    if (myChoiceId && !initialMatch) {
      safeSetItem(LAST_MY_CHOICE_KEY, myChoiceId);
    }
  }, [myChoiceId, initialMatch]);

  useEffect(() => {
    if (initialMatch) return;
    const stored = safeGetItem(LAST_ENVIRONMENT_KEY);
    if (stored && environments.some((environment) => environment.id === stored)) {
      setEnvironmentId(stored);
    } else {
      setEnvironmentId(getMostRecentlyCreatedId(environments));
    }
  }, [environments, initialMatch]);

  useEffect(() => {
    if (environmentId && !initialMatch) {
      safeSetItem(LAST_ENVIRONMENT_KEY, environmentId);
    }
  }, [environmentId, initialMatch]);

  const selectedMyChoice = useMemo(() => myChoices.find((choice) => choice.id === myChoiceId), [myChoices, myChoiceId]);
  const classArchetypes = useMemo(
    () => archetypes.filter((archetype) => archetype.class_name === opponentClass),
    [archetypes, opponentClass]
  );
  const usesArchetypes = archetypes.length > 0;
  const selectedOpponentDeckId = usesArchetypes
    ? opponentArchetypeId || (initialMatch && !initialMatch.opponent_archetype_id ? opponentDeckId : "")
    : opponentDeckId;

  useEffect(() => {
    if (!usesArchetypes || (initialMatch && opponentArchetypeId === (initialMatch.opponent_archetype_id ?? "")
      && !archetypes.some(row => row.id === opponentArchetypeId))) {
      return;
    }

    if (!classArchetypes.some((archetype) => archetype.id === opponentArchetypeId)) {
      setOpponentArchetypeId(classArchetypes[0]?.id ?? "");
    }
  }, [archetypes, classArchetypes, opponentArchetypeId, usesArchetypes, initialMatch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (initialMatch) {
      event.preventDefault();
      if (saving.current) return;
      const parsedRank = validateMatchRank(rank);
      const environment = environments.find(row => row.id === environmentId);
      if (!selectedMyChoice || !selectedOpponentDeckId || !parsedRank.ok || !environment || !isEnvironmentInputEnabled(environment)) {
        setSaveState("error");
        setSaveMessage(!parsedRank.ok ? parsedRank.message : "入力内容と環境の入力可能期間を確認してください。");
        return;
      }
      saving.current = true;
      setIsSaving(true);
      onPendingChange?.(true);
      setSaveState("idle");
      try {
        const response = await onEditSubmit?.(new FormData(event.currentTarget), {
          ...parsedRank.value, environment_id: environmentId,
          my_deck_id: selectedMyChoice.id, opponent_deck_id: selectedOpponentDeckId,
          my_archetype_id: selectedMyChoice.source === "archetype" ? selectedMyChoice.id : null,
          opponent_archetype_id: usesArchetypes ? opponentArchetypeId || null : null,
          turn_order: turnOrder, result, played_at: initialMatch.played_at
        });
        if (!response?.ok) {
          setSaveState("error");
          setSaveMessage(response?.message ?? "変更を保存できませんでした。");
        }
      } catch {
        setSaveState("error");
        setSaveMessage("変更を保存できませんでした。入力内容は保持しています。");
      } finally {
        saving.current = false;
        setIsSaving(false);
        onPendingChange?.(false);
      }
      return;
    }
    if (!guest) {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;

      event.preventDefault();
      if (saving.current || isNavigating) return;
      saving.current = true;
      const nextAction = submitter?.value === "continue" ? "continue" : "home";
      setIsSaving(true);
      setSaveState("idle");
      setSaveMessage("");
      dismissNotification();

      try {
        const formData = new FormData(event.currentTarget);
        formData.set("next_action", nextAction);
        const submittedRank = validateMatchRank({ rank_tier: formData.get("rank_tier"), master_group: formData.get("master_group"), grandmaster_rating: formData.get("grandmaster_rating") });
        const response = await createMatchInline(formData);

        if (response.ok) {
          if (submittedRank.ok) rememberLastRank(rankKey, submittedRank.value);
          notify("success");
          if (nextAction === "home") {
            notifyNavigationStart("/");
            startNavigation(() => router.push("/"));
          } else {
            setSaveState("saved");
          }
        } else {
          setSaveState("error");
          setSaveMessage(response.message ?? "保存できませんでした。");
          notify("error");
        }
      } catch {
        setSaveState("error");
        setSaveMessage("保存できませんでした。");
        notify("error");
      } finally {
        setIsSaving(false);
        saving.current = false;
      }

      return;
    }

    event.preventDefault();
    if (!selectedMyChoice || !environmentId || !selectedOpponentDeckId) {
      return;
    }

    const rankResult = validateMatchRank(rank);
    if (!rankResult.ok) {
      setSaveState("error");
      setSaveMessage(rankResult.message);
      notify("error");
      return;
    }
    setSaveState("idle");
    const response = onGuestSubmit?.({
      ...rankResult.value,
      environment_id: environmentId,
      my_deck_id: selectedMyChoice.id,
      opponent_deck_id: selectedOpponentDeckId,
      my_archetype_id: selectedMyChoice.id,
      opponent_archetype_id: usesArchetypes ? selectedOpponentDeckId : null,
      turn_order: turnOrder,
      result,
      played_at: new Date().toISOString()
    });
    if (response?.ok) {
      rememberLastRank(rankKey, rankResult.value);
      setSaveState("saved");
      setSaveMessage("");
      notify("success");
    } else {
      setSaveState("error");
      setSaveMessage(response?.message ?? "端末に保存できませんでした。");
      notify("error");
    }
  }

  return (
    <form
      action={guest || initialMatch ? undefined : createMatch}
      className="grid gap-4 rounded-md border border-slate-200 bg-white p-4"
      onSubmit={handleSubmit}
    >
      <SaveToast notification={notification} onDismiss={dismissNotification} />
      <fieldset disabled={Boolean(initialMatch) && isSaving} className="grid min-w-0 gap-4">
      {initialMatch && !environments.some(row => row.id === environmentId && isEnvironmentInputEnabled(row)) ? (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-950">この環境は現在入力停止中です。保存には入力可能な環境を選んでください。</p>
      ) : null}
      {(saved || guest) && !initialMatch ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {guest ? "ゲスト体験中です。入力操作だけ確認できます。" : "保存しました。続けて入力できます。"}
        </p>
      ) : null}
      {error || saveState === "error" ? (
        <p role="alert" className="break-words rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {saveState === "error" ? saveMessage : error}
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
            <option key={environment.id} value={environment.id} disabled={Boolean(initialMatch) && !isEnvironmentInputEnabled(environment)}>
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
          {initialMatch ? "現在の使用デッキ" : "前回選択はこの端末に記憶されます。"}
          <DeckWithClassIcon className={selectedMyChoice.class_name} compact name={selectedMyChoice.name} />
        </p>
      ) : null}

      <section className="grid gap-2">
        <div className="text-sm font-semibold text-ink">相手デッキ</div>
        {usesArchetypes ? (
          <>
            <input name="opponent_archetype_id" type="hidden" value={opponentArchetypeId} />
            {initialMatch?.opponent_archetype_id && !archetypes.some(row => row.id === initialMatch.opponent_archetype_id) ? (
              <button type="button" className={cn("min-h-11 rounded-md border px-3 text-left text-sm", opponentArchetypeId === initialMatch.opponent_archetype_id && "bg-ink text-white")}
                onClick={() => setOpponentArchetypeId(initialMatch.opponent_archetype_id!)}>元の相手デッキ（現在選択肢なし）</button>
            ) : null}
            {initialMatch && !initialMatch.opponent_archetype_id ? <>
              {!opponentArchetypeId ? <input name="opponent_deck_id" type="hidden" value={opponentDeckId} /> : null}
              <button type="button" className={cn("min-h-11 rounded-md border px-3 text-left text-sm", !opponentArchetypeId && "bg-ink text-white")}
                onClick={() => setOpponentArchetypeId("")}>{decks.find(deck => deck.id === initialMatch.opponent_deck_id)?.name ?? "元の相手デッキ"}</button>
            </> : null}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {SHADOWVERSE_CLASSES.map((className) => (
                <button
                  className={cn("grid min-h-12 place-items-center rounded-md border", opponentClass === className ? "border-ink ring-2 ring-slate-300" : "border-slate-300")}
                  key={className}
                  onClick={() => {
                    setOpponentClass(className);
                    const next = archetypes.find((archetype) => archetype.class_name === className);
                    setOpponentArchetypeId(next?.id ?? "");
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

      <RankFields value={rank} onChange={setRank} disabled={isSaving || isNavigating} />

      <div className="grid gap-2 sm:grid-cols-2">
        {initialMatch ? <>
          <Button type="submit" disabled={isSaving}>{isSaving ? "保存中..." : "変更を保存"}</Button>
          <Button type="button" variant="secondary" disabled={isSaving} onClick={onCancel}>編集をキャンセル</Button>
          <p role="status" className="text-sm text-muted sm:col-span-2">{isSaving ? "戦績を保存しています。" : ""}</p>
        </> : <MatchSubmitButtons guest={guest} pendingOverride={isSaving || isNavigating} />}
      </div>
      </fieldset>
    </form>
  );
}

function MatchSubmitButtons({ guest, pendingOverride = false }: { guest: boolean; pendingOverride?: boolean }) {
  const { pending } = useFormStatus();
  const isPending = pending || pendingOverride;

  return (
    <>
      <Button aria-disabled={isPending} onClick={event => { if (isPending) event.preventDefault(); }} name="next_action" type="submit" value="continue">
        {isPending ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
        {isPending ? "保存中..." : guest ? "入力を試す" : "保存して続ける"}
      </Button>
      <Button
        aria-disabled={isPending}
        className={guest ? "hidden" : undefined}
        onClick={event => { if (isPending) event.preventDefault(); }}
        name="next_action"
        type="submit"
        value="home"
        variant="secondary"
      >
        {isPending ? "保存中..." : "保存してホームへ"}
      </Button>
      <p aria-live="polite" className="min-h-16 rounded-md px-3 py-2 text-sm font-semibold text-muted sm:col-span-2">
        {isPending ? "戦績を保存しています。完了するまでこのままお待ちください。" : ""}
      </p>
    </>
  );
}
