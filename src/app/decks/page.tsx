import { AppShell } from "@/components/AppShell";
import { ClassIcon } from "@/components/ClassIcon";
import { DeckSuggestionForm } from "@/components/decks/DeckSuggestionForm";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { getActiveArchetypes } from "@/lib/data";

export default async function DecksPage() {
  const archetypes = await getActiveArchetypes();

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">デッキ管理</h1>
          <p className="mt-1 text-sm text-muted">
            標準デッキは運営者が管理します。一覧にないデッキは候補として申請してください。
          </p>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold text-ink">標準デッキ一覧</h2>
          </div>
          <div className="grid gap-4 p-4">
            {archetypes.length === 0 ? (
              <p className="text-sm text-muted">標準デッキがまだ登録されていません。</p>
            ) : (
              SHADOWVERSE_CLASSES.map((className) => {
                const classDecks = archetypes.filter((deck) => deck.class_name === className);
                if (classDecks.length === 0) {
                  return null;
                }

                return (
                  <div className="grid gap-2" key={className}>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                      <ClassIcon className={className} size={28} />
                      <span className="sr-only">{className}</span>
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {classDecks.map((deck) => (
                        <div className="rounded-md border border-slate-200 px-3 py-2" key={deck.id}>
                          <div className="text-sm font-semibold text-ink">{deck.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-bold text-ink">一覧にないデッキを提案</h2>
          <DeckSuggestionForm />
        </section>
      </div>
    </AppShell>
  );
}
