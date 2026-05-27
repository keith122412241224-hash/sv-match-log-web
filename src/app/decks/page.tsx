import { Save, Trash2 } from "lucide-react";
import { createDeck, deleteDeck, updateDeck } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { ClassIcon, DeckWithClassIcon } from "@/components/ClassIcon";
import { ClassPicker } from "@/components/ClassPicker";
import { DeckSuggestionForm } from "@/components/decks/DeckSuggestionForm";
import { FieldLabel, Input } from "@/components/Field";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { getActiveArchetypes, getDecks, getIsAdmin } from "@/lib/data";

export default async function DecksPage() {
  const [decks, archetypes, isAdmin] = await Promise.all([getDecks(), getActiveArchetypes(), getIsAdmin()]);

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

        {isAdmin ? (
          <form action={createDeck} className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
            <FieldLabel>
              管理者用カスタムデッキ名
              <Input name="name" required placeholder="例: ミッドレンジロイヤル" />
            </FieldLabel>
            <FieldLabel>
              クラス
              <ClassPicker />
            </FieldLabel>
            <FieldLabel>
              表示順
              <Input name="sort_order" type="number" defaultValue={0} />
            </FieldLabel>
            <Button type="submit">追加</Button>
          </form>
        ) : null}

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold text-ink">マイデッキ一覧</h2>
          </div>
          <div className="grid gap-3 p-4">
            {decks.length === 0 ? (
              <p className="text-sm text-muted">標準デッキを使って戦績入力すると、互換用のマイデッキが自動作成されます。</p>
            ) : isAdmin ? (
              decks.map((deck) => (
                <form action={updateDeck} className="grid gap-3 rounded-md border border-slate-200 p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,420px)_100px_auto] lg:items-end" key={deck.id}>
                  <input name="id" type="hidden" value={deck.id} />
                  <FieldLabel>
                    デッキ名
                    <Input name="name" defaultValue={deck.name} required />
                  </FieldLabel>
                  <FieldLabel>
                    クラス
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <ClassPicker compact defaultValue={deck.class_name} />
                    </div>
                  </FieldLabel>
                  <FieldLabel>
                    表示順
                    <Input name="sort_order" type="number" defaultValue={deck.sort_order} />
                  </FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="secondary">
                      <Save size={16} aria-hidden="true" />
                      更新
                    </Button>
                    <Button formAction={deleteDeck.bind(null, deck.id)} type="submit" variant="danger">
                      <Trash2 size={16} aria-hidden="true" />
                      削除
                    </Button>
                  </div>
                </form>
              ))
            ) : (
              <div className="grid gap-2">
                {decks.map((deck) => (
                  <div className="rounded-md border border-slate-200 px-3 py-2" key={deck.id}>
                    <DeckWithClassIcon className={deck.class_name} name={deck.name} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
