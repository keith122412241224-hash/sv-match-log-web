"use client";

import { deleteEnvironment } from "@/app/admin/actions";
import { FieldLabel, Input } from "@/components/Field";
import { BatchRowResult, BatchSummary, useBatchUpdate } from "./BatchUpdate";
import { SubmitButton } from "@/components/SubmitButton";
import { environmentInputStatus, isoToJstInput } from "@/lib/environment-input";
import type { Environment } from "@/types/database";

export function AdminEnvironmentTable({ environments, serverNow }: { environments: Environment[]; serverNow: number }) {
  const batch = useBatchUpdate("environment", environments);
  if (batch.records.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">環境がありません。</p>;
  }

  return (
    <form action="/admin/environments" method="post" onSubmit={batch.submit} onChange={batch.changed} noValidate aria-busy={batch.pending} className="grid gap-3">
      <BatchSummary batch={batch} kind="environment" />
      <input type="hidden" name="operation" value="update" />
      {batch.records.map((environment) => (
        <section className="rounded-md border border-slate-200 bg-white p-4" key={environment.id}>
          <fieldset disabled={batch.locked(environment.id)} aria-describedby={batch.status(environment.id) ? `batch-result-${environment.id}` : undefined} className="min-w-0">
          <input type="hidden" name={`baseline_${environment.id}`} value={batch.baseline(environment)} />
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
              data-batch-delete
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
          <div className="mt-3 max-w-md">
            <FieldLabel>環境データ集計終了日時（日本時間）
              <Input type="datetime-local" step="0.001" name={`dashboard_end_at_${environment.id}`} defaultValue={isoToJstInput(environment.dashboard_end_at)} />
            </FieldLabel>
          </div>
          <p className="mt-2 text-xs text-muted">設定した日時の直前までの戦績を集計します。未設定・未来日時の場合は現在の集計基準時刻まで集計します。入力受付とは独立した設定です。</p>
          {batch.status(environment.id)?.status !== "success" && <p className="mt-2 text-sm font-semibold text-ink">編集開始時の状態：{environmentInputStatus(environment, serverNow)}</p>}
          </fieldset>
          <BatchRowResult row={batch.status(environment.id)} />
        </section>
      ))}
      <div className="flex justify-end">
        <SubmitButton disabled={!batch.canSubmit} pendingLabel="一括更新中..." type="submit">
          {batch.label}
        </SubmitButton>
      </div>
    </form>
  );
}
