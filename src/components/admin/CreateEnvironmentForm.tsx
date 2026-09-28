import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function CreateEnvironmentForm() {
  return (
    <form action="/admin/environments" method="post" className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <input type="hidden" name="operation" value="create" />
      <FieldLabel>
        環境名
        <Input name="name" required placeholder="例: ナーフ後 / 2026年6月ランクマ" />
      </FieldLabel>
      <FieldLabel>
        開始日
        <Input name="start_date" type="date" />
      </FieldLabel>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_match_input" defaultChecked />戦績入力を許可する</label>
      <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
        <FieldLabel>入力開始日時（日本時間）<Input name="match_input_start_at" type="datetime-local" step="0.001" /></FieldLabel>
        <FieldLabel>入力終了日時（日本時間）<Input name="match_input_end_at" type="datetime-local" step="0.001" /></FieldLabel>
      </div>
      <p className="text-xs text-muted sm:col-span-2">日時の空欄は制限なし。終了時刻から入力できなくなります。</p>
      <SubmitButton pendingLabel="追加中..." type="submit">
        環境を追加
      </SubmitButton>
    </form>
  );
}
