import { approveSuggestionAsArchetype, updateSuggestionStatus } from "@/app/admin/actions";
import { ClassIcon } from "@/components/ClassIcon";
import { Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";
import type { DeckSuggestion } from "@/types/database";

export function SuggestionsPanel({ suggestions }: { suggestions: DeckSuggestion[] }) {
  const pending = suggestions.filter((suggestion) => suggestion.status === "pending");

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-bold text-ink">新規デッキ候補</h2>
        <p className="mt-1 text-sm text-muted">ユーザーが「一覧にないデッキ」として提案した候補です。</p>
      </div>
      <div className="grid gap-3 p-4">
        {pending.length === 0 ? (
          <p className="text-sm text-muted">未処理の提案はありません。</p>
        ) : (
          pending.map((suggestion) => (
            <article className="grid gap-3 rounded-md border border-slate-200 p-3" key={suggestion.id}>
              <form action={approveSuggestionAsArchetype} className="grid gap-3 lg:grid-cols-[160px_1fr_auto] lg:items-end">
                <input name="suggestion_id" type="hidden" value={suggestion.id} />
                <input name="class_name" type="hidden" value={suggestion.class_name} />
                <div>
                  <div className="mb-1 text-xs font-bold text-muted">クラス</div>
                  <ClassIcon className={suggestion.class_name} size={34} />
                </div>
                <label className="grid gap-1.5 text-sm font-semibold text-ink">
                  標準デッキ名
                  <Input name="name" defaultValue={suggestion.suggested_name} />
                </label>
                <SubmitButton type="submit" pendingLabel="採用中...">採用</SubmitButton>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {suggestion.memo ? <p className="text-sm text-muted">メモ: {suggestion.memo}</p> : <span />}
                <form action={updateSuggestionStatus}>
                  <input name="id" type="hidden" value={suggestion.id} />
                  <input name="status" type="hidden" value="rejected" />
                  <SubmitButton type="submit" variant="secondary" pendingLabel="却下中...">却下</SubmitButton>
                </form>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
