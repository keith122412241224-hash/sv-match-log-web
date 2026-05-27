import { updateEnvironmentsBatch } from "@/app/admin/actions";
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
          <div className="grid gap-3 sm:grid-cols-[1fr_180px] sm:items-end">
            <FieldLabel>
              環境名
              <Input name={`name_${environment.id}`} defaultValue={environment.name} required />
            </FieldLabel>
            <FieldLabel>
              開始日
              <Input name={`start_date_${environment.id}`} type="date" defaultValue={environment.start_date ?? ""} />
            </FieldLabel>
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
