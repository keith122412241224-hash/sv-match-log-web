"use client";

import { EmptyState } from "@/components/EmptyState";
import { QuickMatchForm } from "@/components/matches/QuickMatchForm";
import { useScheduledEnvironments } from "@/components/matches/useScheduledEnvironments";
import type { Deck, DeckArchetype, Environment } from "@/types/database";

export function ScheduledMatchForm({ environments, serverNow, ...props }: {
  environments: Environment[];
  serverNow: number;
  decks: Deck[];
  archetypes: DeckArchetype[];
  error?: string;
  saved?: boolean;
  userId?: string;
}) {
  const enabled = useScheduledEnvironments(environments, serverNow);
  return enabled.length ? <QuickMatchForm {...props} environments={enabled} /> : (
    <EmptyState
      title="入力できる環境がありません"
      description="手動許可と入力可能期間の両方を満たす環境がありません。予約された開始日時に自動で更新されます。"
      href="/admin"
      action="管理画面へ"
    />
  );
}
