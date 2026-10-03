"use client";

import { deleteEnvironment } from "@/app/admin/actions";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";
import { environmentInputStatus, isoToJstInput } from "@/lib/environment-input";
import type { Environment } from "@/types/database";

export function AdminEnvironmentTable({ environments, serverNow }: { environments: Environment[]; serverNow: number }) {
  if (environments.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">環境がありません。</p>;
  }

  return (
    <form action="/admin/environments" method="post" className="grid gap-3">
      <input type="hidden" name="operation" value="update" />
      {environments.map((environment) => (
        <section className="rounded-md border border-slate-200 bg-white p-4" key={environment.id}>
          <input name="environment_ids" type="hidden" value={environment.id} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_220px_auto] sm:items-end">
            <FieldLabel>
              環境名
              <Input name={`name_${environment.id}`} defaultValue={environment.name} required />
            </FieldLabel>
            <FieldLabel>
              開始日
              <Input name={`start_date_${environment.id}`} type="date" defaultValue={environment.start_date ?? ""} />
            </FieldLabel>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-ink">
              <input
                className="h-4 w-4 accent-slate-900"
                defaultChecked={environment.allow_match_input}
                name={`allow_match_input_${environment.id}`}
                type="checkbox"
              />
              戦績入力を許可する
            </label>
            <SubmitButton
              className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
              formAction={deleteEnvironment.bind(null, environment.id)}
              formNoValidate
              onClick={(event) => {
                if (!window.confirm(`「${environment.name}」を削除しますか？\nこの環境を使った戦績がある場合は削除できません。`)) {
                  event.preventDefault();
                }
              }}
              pendingLabel="削除中..."
              type="submit"
            >
              削除
            </SubmitButton>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FieldLabel>入力開始日時（日本時間）
              <Input type="datetime-local" step="0.001" name={`match_input_start_at_${environment.id}`} defaultValue={isoToJstInput(environment.match_input_start_at)} />
            </FieldLabel>
            <FieldLabel>入力終了日時（日本時間）
              <Input type="datetime-local" step="0.001" name={`match_input_end_at_${environment.id}`} defaultValue={isoToJstInput(environment.match_input_end_at)} />
            </FieldLabel>
          </div>
          <p className="mt-2 text-xs text-muted">空欄は制限なし。開始時刻から入力でき、終了時刻から入力できなくなります。手動許可を外すと即停止します。</p>
          <p className="mt-2 text-sm font-semibold text-ink">保存済みの状態：{environmentInputStatus(environment, serverNow)}</p>
        </section>
      ))}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="一括更新中..." type="submit">
          環境を一括更新
        </SubmitButton>
      </div>
    </form>
  );
}
