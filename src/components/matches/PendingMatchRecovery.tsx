"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatchInline } from "@/app/actions";
import { Button } from "@/components/Button";
import { MATCH_SUBMISSION_EVENT, isMatchSubmitting, readMatchSubmission, submissionForm, submitMatchSubmission, type PendingMatchSubmission } from "@/lib/match-submission";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import { validateMatchRank } from "@/lib/match-rank";
import { lastRankKey, rememberLastRank } from "@/lib/match-rank-preference";
import type { Deck, DeckArchetype, Environment, MatchResult, TurnOrder } from "@/types/database";

// Mounted outside the scheduled form so a saved request can still be recovered
// when no environment accepts new matches.
export function PendingMatchRecovery({ userId, environments, decks, archetypes }: {
  userId?: string; environments: Environment[]; decks: Deck[]; archetypes: DeckArchetype[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMatchSubmission | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const update = () => {
      if (!userId) return;
      try {
        setPending(readMatchSubmission(userId));
        setBusy(isMatchSubmitting(userId));
        if (isMatchSubmitting(userId)) setMessage("");
      }
      catch { setMessage("保存確認用の入力情報を読み取れません。別の登録を始める前に戦績を確認してください。"); }
    };
    update();
    window.addEventListener(MATCH_SUBMISSION_EVENT, update);
    window.addEventListener("pageshow", update);
    return () => { window.removeEventListener(MATCH_SUBMISSION_EVENT, update); window.removeEventListener("pageshow", update); };
  }, [userId]);
  async function retry() {
    if (!pending || busy) return;
    setMessage("");
    try {
      const response = await submitMatchSubmission(userId, submissionForm(pending), createMatchInline);
      if (response.ok) {
        const rank = validateMatchRank(pending.fields);
        if (rank.ok) rememberLastRank(lastRankKey(userId, false), rank.value);
        setMessage("保存を確認しました。続けて入力できます。");
        if (pending.nextAction === "home") router.push("/");
        else router.refresh();
      } else setMessage(response.message ?? "保存状態を確認できませんでした。再試行してください。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存状態を確認できませんでした。再試行してください。"); }
  }
  if (!pending && !message) return null;
  const name = (side: "my" | "opponent") => archetypes.find(row => row.id === pending?.fields[`${side}_archetype_id`])?.name
    ?? decks.find(row => row.id === pending?.fields[`${side}_deck_id`])?.name ?? "選択済みデッキ";
  return <section className="grid min-w-0 gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" aria-label="未確認の戦績保存">
    {pending ? <>
      <p>入力内容を保持しています。保存状態を確認してから次の戦績を登録してください。</p>
      <p className="break-words">{environments.find(row => row.id === pending.fields.environment_id)?.name ?? "選択済み環境"}：{name("my")} 対 {name("opponent")}／{TURN_ORDER_LABELS[pending.fields.turn_order as TurnOrder]}／{RESULT_LABELS[pending.fields.result as MatchResult]}</p>
      <Button type="button" disabled={busy} onClick={retry}>{busy ? "保存状態を確認中..." : "保存状態を確認して再試行"}</Button>
    </> : null}
    {message ? <p role="status" className="break-words">{message}</p> : null}
  </section>;
}
