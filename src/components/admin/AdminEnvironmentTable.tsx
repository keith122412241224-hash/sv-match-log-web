"use client";

import { deleteEnvironment, updateEnvironmentsBatch } from "@/app/admin/actions";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";
import type { Environment } from "@/types/database";

export function AdminEnvironmentTable({ environments }: { environments: Environment[] }) {
  if (environments.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">環境がありません。</p>;
  }

  return (
    <form action={updateEnvironmentsBatch} className="grid gap-3">
      {environments.map((environment) => (
        <section className="rounded-md border border-slate-200 bg-white p-4" key={environment.id}>
          <input name="environment_ids" type="hidden" value={environment.id} />
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <FieldLabel>
              環境名
              <Input name={`name_${environment.id}`} defaultValue={environment.name} required />
            </FieldLabel>
            <FieldLabel>
              開始日
              <Input name={`start_date_${environment.id}`} type="date" defaultValue={environment.start_date ?? ""} />
            </FieldLabel>
            <button
              className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
              formAction={deleteEnvironment.bind(null, environment.id)}
              formNoValidate
              onClick={(event) => {
                if (!window.confirm(`「${environment.name}」を削除しますか？\nこの環境を使った戦績がある場合は削除できません。`)) {
                  event.preventDefault();
                }
              }}
              type="submit"
            >
              削除
            </button>
          </div>
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
