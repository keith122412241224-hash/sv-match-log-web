import { createEnvironment } from "@/app/admin/actions";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function CreateEnvironmentForm() {
  return (
    <form action={createEnvironment} className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <FieldLabel>
        環境名
        <Input name="name" required placeholder="例: ナーフ後 / 2026年6月ランクマ" />
      </FieldLabel>
      <FieldLabel>
        開始日
        <Input name="start_date" type="date" />
      </FieldLabel>
      <SubmitButton pendingLabel="追加中..." type="submit">
        環境を追加
      </SubmitButton>
    </form>
  );
}
