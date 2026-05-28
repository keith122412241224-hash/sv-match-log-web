"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { EmptyState } from "@/components/EmptyState";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { QuickMatchForm } from "@/components/matches/QuickMatchForm";
import type { GuestMatchDraft } from "@/components/matches/QuickMatchForm";
import { StatCard } from "@/components/StatCard";
import { buildDeckAnalysisSummaries, buildWinRateMatrix, summarizeMatches } from "@/lib/analytics";
import { GUEST_MATCHES_STORAGE_KEY, type StoredGuestMatch } from "@/lib/guest-storage";
import { formatPercent } from "@/lib/utils";
import type { Deck, DeckArchetype, Environment, Match } from "@/types/database";

type Tab = "home" | "input" | "analysis" | "matrix";

export function GuestApp({
  archetypes,
  environments
}: {
  archetypes: DeckArchetype[];
  environments: Environment[];
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [matches, setMatches] = useState<Match[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    const raw = window.localStorage.getItem(GUEST_MATCHES_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMatches(parsed.map(toGuestMatch));
      }
    } catch {
      window.localStorage.removeItem(GUEST_MATCHES_STORAGE_KEY);
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
    const createdAt = new Date().toISOString();
    setMatches((current) => {
      const nextMatch = {
        id: `guest-match-${createdAt}-${current.length}`,
        user_id: "guest-user",
        environment_id: draft.environment_id,
        my_deck_id: draft.my_deck_id,
        opponent_deck_id: draft.opponent_deck_id,
        my_user_deck_id: null,
        my_archetype_id: draft.my_archetype_id,
        opponent_archetype_id: draft.opponent_archetype_id,
        turn_order: draft.turn_order,
        result: draft.result,
        played_at: draft.played_at,
        memo: draft.memo,
        created_at: createdAt
      };
      const next = [nextMatch, ...current];
      window.localStorage.setItem(GUEST_MATCHES_STORAGE_KEY, JSON.stringify(next.map(toStoredGuestMatch)));
      return next;
    });
    setSavedCount((count) => count + 1);
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="font-bold text-ink">ゲストモード</h1>
            <p className="text-xs text-muted">実際の標準デッキと環境で、入力から分析まで試せます。ログインすると正式データへ取り込めます。</p>
          </div>
          <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/login">ログイン</Link>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {([
            ["home", "ホーム"],
            ["input", "戦績入力"],
            ["analysis", "分析"],
            ["matrix", "相性表"]
          ] as const).map(([value, label]) => (
            <button className={tab === value ? "min-h-10 shrink-0 rounded-md bg-ink px-3 text-sm font-bold text-white" : "min-h-10 shrink-0 rounded-md px-3 text-sm font-bold text-muted"} key={value} onClick={() => setTab(value)} type="button">
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          ゲスト入力はこの端末に一時保存されます。正式に残すにはログイン後に取り込んでください。
        </p>

        {tab === "home" ? (
          <>
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
                    const environmentName = environments.find((environment) => environment.id === match.environment_id)?.name ?? "-";
                    return (
                      <div className="rounded bg-slate-50 px-3 py-2 text-sm" key={match.id}>
                        <span className="font-semibold text-ink">{match.result === "win" ? "勝ち" : "負け"}</span>
                        <span className="text-muted"> / {environmentName} / {myDeck?.name ?? "-"} vs {opponentDeck?.name ?? "-"}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
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
    environment_id: match.environment_id,
    my_deck_id: match.my_deck_id,
    opponent_deck_id: match.opponent_deck_id,
    my_archetype_id: match.my_archetype_id,
    opponent_archetype_id: match.opponent_archetype_id,
    turn_order: match.turn_order,
    result: match.result,
    played_at: match.played_at,
    memo: match.memo
  };
}

function toGuestMatch(match: StoredGuestMatch, index: number): Match {
  const createdAt = new Date().toISOString();
  return {
    id: `guest-match-restored-${index}`,
    user_id: "guest-user",
    environment_id: match.environment_id,
    my_deck_id: match.my_deck_id,
    opponent_deck_id: match.opponent_deck_id,
    my_user_deck_id: null,
    my_archetype_id: match.my_archetype_id,
    opponent_archetype_id: match.opponent_archetype_id,
    turn_order: match.turn_order,
    result: match.result,
    played_at: match.played_at,
    memo: match.memo,
    created_at: createdAt
  };
}
