import { createDeckSuggestion } from "@/app/actions";
import { Button } from "@/components/Button";
import { ClassPicker } from "@/components/ClassPicker";
import { FieldLabel, Input, Textarea } from "@/components/Field";

export function DeckSuggestionForm() {
  return (
    <form action={createDeckSuggestion} className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
      <FieldLabel>
        クラス
        <ClassPicker compact />
      </FieldLabel>
      <FieldLabel>
        一覧にないデッキ名
        <Input name="suggested_name" required placeholder="例: 新しいナイトメア" />
      </FieldLabel>
      <Button type="submit" variant="secondary">候補を申請</Button>
      <div className="sm:col-span-3">
        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">メモを添える</summary>
          <div className="mt-3">
            <Textarea name="memo" placeholder="採用理由、補足など" />
          </div>
        </details>
      </div>
    </form>
  );
}
