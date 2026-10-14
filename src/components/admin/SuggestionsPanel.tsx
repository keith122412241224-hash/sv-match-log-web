"use client";
import { useState } from "react";
import { SuggestionDecisionForm } from "@/components/admin/SuggestionDecisionForm";
import { suggestionPauseMessage } from "@/lib/suggestion-decision";
import type { DeckSuggestion } from "@/types/database";

export function SuggestionsPanel({ suggestions, paused }: { suggestions: DeckSuggestion[]; paused: boolean }) {
  const [pending] = useState(() => suggestions.filter((suggestion) => suggestion.status === "pending"));

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-bold text-ink">新規デッキ候補</h2>
        <p className="mt-1 text-sm text-muted">ユーザーが「一覧にないデッキ」として提案した候補です。</p>
        {paused && <p role="status" className="mt-2 text-sm font-semibold">{suggestionPauseMessage}</p>}
      </div>
      <div className="grid gap-3 p-4">
        {pending.length === 0 ? (
          <p className="text-sm text-muted">未処理の提案はありません。</p>
        ) : (
          pending.map((suggestion) => (
            <SuggestionDecisionForm key={suggestion.id} suggestion={suggestion} paused={paused} />
          ))
        )}
      </div>
    </section>
  );
}
