"use client";

import { appendGuestMatch, loadIdentifiedGuestMatches, mutateGuestMatch } from "@/lib/guest-records";
import { MatchActions, MatchActionsProvider } from "@/components/matches/MatchActions";
import { isEnvironmentInputEnabled } from "@/lib/environment-input";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { EmptyState } from "@/components/EmptyState";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { QuickMatchForm } from "@/components/matches/QuickMatchForm";
import type { GuestMatchDraft } from "@/components/matches/QuickMatchForm";
import { StatCard } from "@/components/StatCard";
import { buildDeckAnalysisSummaries, buildWinRateMatrix, summarizeMatches } from "@/lib/analytics";
import { type StoredGuestMatch } from "@/lib/guest-storage";
import { formatPercent } from "@/lib/utils";
import type { Deck, DeckArchetype, Environment, Match } from "@/types/database";

type Tab = "home" | "input" | "analysis" | "matrix";

export function GuestApp({
  archetypes,
  environments,
  allEnvironments = environments
}: {
  archetypes: DeckArchetype[];
  environments: Environment[];
  allEnvironments?: Environment[];
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [matches, setMatches] = useState<Match[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      setMatches(loadIdentifiedGuestMatches(window.localStorage).map(toGuestMatch));
    } catch {
      setStorageError("端末の戦績を読み込めません。既存データは削除していません。保存設定とデータ形式を確認してください。");
    }
  }, []);

  const guestDecks = useMemo<Deck[]>(
    () =>
      archetypes.map((archetype) => ({
        id: archetype.id,
        user_id: "guest-user",
        name: archetype.name,
        class_name: archetype.class_name,
        deck_type: "my_deck",
        sort_order: archetype.sort_order,
        created_at: archetype.created_at
      })),
    [archetypes]
  );

  const summary = useMemo(() => summarizeMatches(matches), [matches]);
  const matrix = useMemo(() => buildWinRateMatrix(matches, guestDecks, guestDecks), [guestDecks, matches]);
  const deckSummaries = useMemo(() => buildDeckAnalysisSummaries(matches, guestDecks), [guestDecks, matches]);
  const canInput = archetypes.length > 0 && environments.length > 0;

  function addGuestMatch(draft: GuestMatchDraft) {
    try {
      const createdAt = new Date().toISOString();
      const nextMatch: Match = {
        ...draft, id: crypto.randomUUID(), user_id: "guest-user",
        my_user_deck_id: null, memo: null, created_at: createdAt
      };
      // Read immediately before saving so another tab's additions and unknown
      // fields survive. Update React state only after persistence succeeds.
      const next = appendGuestMatch(window.localStorage, toStoredGuestMatch(nextMatch));
      setMatches(next.map(toGuestMatch));
      setSavedCount(count => count + 1);
      setStorageError("");
      return { ok: true };
    } catch {
      setSavedCount(0);
      setStorageError("端末に保存できませんでした。保存設定・容量を確認してください。既存データは削除していません。");
      return { ok: false, message: "端末に保存できませんでした。保存設定・容量を確認してください。既存データは削除していません。" };
    }
  }

  function changeGuestMatch(id: string, draft?: GuestMatchDraft) {
    try {
      if (draft && !environments.some(row => row.id === draft.environment_id && isEnvironmentInputEnabled(row))) {
        return { ok: false, message: "この環境は現在戦績を入力できません。" };
      }
      const next = mutateGuestMatch(window.localStorage, id, draft);
      setMatches(next.map(toGuestMatch));
      setStorageError("");
      return { ok: true };
    } catch {
      return { ok: false, message: "端末の戦績を変更できませんでした。保存設定・容量を確認し、再読み込みしてください。" };
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
          <div className="min-w-0">
            <h1 className="font-bold text-ink">ゲストモード</h1>
            <p className="line-clamp-2 text-xs text-muted">実際の標準デッキと環境で、入力から分析まで試せます。ログインすると正式データへ取り込めます。</p>
          </div>
          <Link className="shrink-0 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white sm:px-4" href="/login">ログイン</Link>
        </div>
        <nav className="mx-auto grid max-w-7xl grid-cols-4 gap-1 px-2 pb-2 sm:flex sm:overflow-x-auto sm:px-4 sm:pb-3">
          {([
            ["home", "ホーム"],
            ["input", "戦績入力"],
            ["analysis", "分析"],
            ["matrix", "相性表"]
          ] as const).map(([value, label]) => (
            <button className={tab === value ? "min-h-11 min-w-0 truncate rounded-md bg-ink px-1 text-[11px] font-bold text-white sm:min-h-10 sm:shrink-0 sm:px-3 sm:text-sm" : "min-h-11 min-w-0 truncate rounded-md px-1 text-[11px] font-bold text-muted sm:min-h-10 sm:shrink-0 sm:px-3 sm:text-sm"} key={value} onClick={() => setTab(value)} type="button">
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-3 py-4 sm:px-4 sm:py-6">
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          ゲスト入力はこの端末に一時保存されます。正式に残すにはログイン後に取り込んでください。
        </p>

        {storageError ? <p role={tab === "input" ? undefined : "alert"} className="text-sm font-semibold text-red-700">{storageError}</p> : null}

        {tab === "home" ? (
          <MatchActionsProvider onGuestMutation={changeGuestMatch}>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="総試合数" value={`${summary.total}`} />
              <StatCard label="勝利数" value={`${summary.wins}`} />
              <StatCard label="勝率" value={formatPercent(summary.winRate)} />
              <StatCard label="先攻勝率" value={formatPercent(summary.firstWinRate)} />
              <StatCard label="後攻勝率" value={formatPercent(summary.secondWinRate)} />
            </section>
            {matches.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">まずは「戦績入力」から1試合入力してみてください。</p>
            ) : (
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="font-bold text-ink">最近の入力</h2>
                <div className="mt-3 grid gap-2">
                  {matches.slice(0, 5).map((match) => {
                    const myDeck = guestDecks.find((deck) => deck.id === match.my_deck_id);
                    const opponentDeck = guestDecks.find((deck) => deck.id === match.opponent_deck_id);
                    const environmentName = allEnvironments.find((environment) => environment.id === match.environment_id)?.name ?? "-";
                    return (
                      <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm" key={match.id}>
                        <div className="min-w-0 break-words">
                        <span className="font-semibold text-ink">{match.result === "win" ? "勝ち" : "負け"}</span>
                        <span className="text-muted"> / {environmentName} / {myDeck?.name ?? "-"} vs {opponentDeck?.name ?? "-"}</span>
                        </div>
                        <MatchActions matchId={match.id} guestData={{ match, decks: guestDecks, environments: allEnvironments, archetypes }} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </MatchActionsProvider>
        ) : null}

        {tab === "input" ? (
          <div>
            {savedCount > 0 ? (
              <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                ゲスト戦績を追加しました。ホーム・分析・相性表に反映されています。
              </p>
            ) : null}
            {canInput ? (
              <QuickMatchForm
                environments={environments}
                archetypes={archetypes}
                decks={guestDecks}
                guest
                onGuestSubmit={addGuestMatch}
              />
            ) : (
              <EmptyState
                title="ゲスト入力の準備ができていません"
                description="管理画面で標準デッキと環境を登録すると、ゲストでも同じ選択肢で入力を試せます。"
                href="/login"
                action="ログインする"
              />
            )}
          </div>
        ) : null}

        {tab === "analysis" ? <DeckAnalysisCards summaries={deckSummaries} /> : null}
        {tab === "matrix" ? <MatchupMatrix rows={matrix} opponentDecks={guestDecks} title="ゲスト対面勝率表" environmentName="ゲスト入力" /> : null}
      </main>
    </div>
  );
}

function toStoredGuestMatch(match: Match): StoredGuestMatch {
  return {
    local_id: match.id,
    environment_id: match.environment_id,
    my_deck_id: match.my_deck_id,
    opponent_deck_id: match.opponent_deck_id,
    my_archetype_id: match.my_archetype_id,
    opponent_archetype_id: match.opponent_archetype_id,
    turn_order: match.turn_order,
    result: match.result,
    rank_tier: match.rank_tier ?? null,
    master_group: match.master_group ?? null,
    grandmaster_rating: match.grandmaster_rating ?? null,
    played_at: match.played_at
  };
}

function toGuestMatch(match: StoredGuestMatch): Match {
  const createdAt = new Date().toISOString();
  return {
    id: match.local_id || crypto.randomUUID(),
    user_id: "guest-user",
    environment_id: match.environment_id,
    my_deck_id: match.my_deck_id,
    opponent_deck_id: match.opponent_deck_id,
    my_user_deck_id: null,
    my_archetype_id: match.my_archetype_id,
    opponent_archetype_id: match.opponent_archetype_id,
    turn_order: match.turn_order,
    result: match.result,
    rank_tier: match.rank_tier ?? null,
    master_group: match.master_group ?? null,
    grandmaster_rating: match.grandmaster_rating ?? null,
    played_at: match.played_at,
    memo: null,
    created_at: createdAt
  };
}
