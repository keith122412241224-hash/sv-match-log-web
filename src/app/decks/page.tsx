import { ChevronDown, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ClassIcon } from "@/components/ClassIcon";
import { DeckSuggestionForm } from "@/components/decks/DeckSuggestionForm";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { getActiveArchetypes } from "@/lib/data";

export default async function DecksPage() {
  const archetypes = await getActiveArchetypes();
  // Keep the established class order; retain unexpected class values after it.
  const classNames = [...new Set<string>([...SHADOWVERSE_CLASSES, ...archetypes.map((deck) => deck.class_name)])];

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">デッキ管理</h1>
          <p className="mt-1 text-sm text-muted">
            標準デッキは運営者が管理します。一覧にないデッキは候補として申請してください。
          </p>
        </section>

        <details className="group/suggestion rounded-md border border-slate-300 bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-md px-4 py-3 text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 [&::-webkit-details-marker]:hidden">
            <Plus size={18} className="shrink-0" aria-hidden="true" />
            <h2 className="min-w-0 flex-1 font-bold">デッキ候補を申請</h2>
            <ChevronDown size={18} className="shrink-0 group-open/suggestion:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-slate-200 p-3 sm:p-4">
            <p className="mb-3 text-sm text-muted">一覧にないデッキを提案できます。</p>
            <DeckSuggestionForm />
          </div>
        </details>

        <section aria-labelledby="standard-decks-heading" className="min-w-0 rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 id="standard-decks-heading" className="font-bold text-ink">標準デッキ一覧（{archetypes.length}デッキ）</h2>
          </div>
          <div className="grid gap-2 p-3 sm:p-4">
            {archetypes.length === 0 ? (
              <p className="text-sm text-muted">標準デッキがまだ登録されていません。</p>
            ) : (
              classNames.map((className) => {
                const classDecks = archetypes.filter((deck) => deck.class_name === className);
                if (classDecks.length === 0) {
                  return null;
                }

                return (
                  <details className="group/class min-w-0 rounded-md border border-slate-200" key={className}>
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-md px-3 py-3 text-sm text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 [&::-webkit-details-marker]:hidden">
                      <ChevronDown size={16} className="shrink-0 -rotate-90 group-open/class:rotate-0" aria-hidden="true" />
                      <span className="shrink-0" aria-hidden="true"><ClassIcon className={className} size={28} /></span>
                      <h3 className="min-w-0 flex-1 break-words font-bold [overflow-wrap:anywhere]">{className || "クラス未設定"}</h3>
                      <span className="shrink-0 text-xs text-muted">{classDecks.length}デッキ</span>
                    </summary>
                    <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {classDecks.map((deck) => (
                        <div className="min-w-0 rounded-md border border-slate-200 px-3 py-2" key={deck.id}>
                          <div className="break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">{deck.name}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
