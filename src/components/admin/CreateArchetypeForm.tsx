import { createArchetype } from "@/app/admin/actions";
import { ClassPicker } from "@/components/ClassPicker";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function CreateArchetypeForm() {
  return (
    <form action={createArchetype} className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 lg:grid-cols-[180px_1fr_120px] lg:items-end">
      <FieldLabel>
        クラス
        <ClassPicker compact />
      </FieldLabel>
      <FieldLabel>
        標準デッキ名
        <Input name="name" required placeholder="例: ミルティオナイトメア" />
      </FieldLabel>
      <FieldLabel>
        表示順
        <Input name="sort_order" type="number" defaultValue={0} />
      </FieldLabel>
      <div className="flex flex-wrap gap-3 text-sm font-semibold text-ink lg:col-span-3">
        <label className="inline-flex items-center gap-2">
          <input name="is_active" type="checkbox" defaultChecked />
          有効
        </label>
        <label className="inline-flex items-center gap-2">
          <input name="is_other" type="checkbox" />
          その他
        </label>
      </div>
      <div className="lg:col-span-3">
        <SubmitButton pendingLabel="追加中..." type="submit">標準デッキを追加</SubmitButton>
      </div>
    </form>
  );
}
