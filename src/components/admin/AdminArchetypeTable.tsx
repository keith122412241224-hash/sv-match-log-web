"use client";


import { ClassPicker } from "@/components/ClassPicker";
import { FieldLabel, Input } from "@/components/Field";
import { BatchRowResult, BatchSummary, useBatchUpdate } from "./BatchUpdate";
import { SubmitButton } from "@/components/SubmitButton";
import type { ArchetypeWithAliases } from "@/types/view-models";

export function AdminArchetypeTable({ archetypes }: { archetypes: ArchetypeWithAliases[] }) {
  const batch = useBatchUpdate("archetype", archetypes);
  if (batch.records.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">標準デッキがありません。</p>;
  }

  return (
    <form onSubmit={batch.submit} onChange={batch.changed} noValidate aria-busy={batch.pending} className="grid gap-3">
      <BatchSummary batch={batch} kind="archetype" />
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <p className="text-sm font-semibold text-ink">編集後、最後に一括更新してください。</p>
        <SubmitButton disabled={!batch.canSubmit} pendingLabel="一括更新中..." type="submit" variant="primary">
          {batch.label}
        </SubmitButton>
      </div>

      {batch.records.map((archetype) => (
        <section className="rounded-md border border-slate-200 bg-white p-4" key={archetype.id}>
          <fieldset disabled={batch.locked(archetype.id)} aria-describedby={batch.status(archetype.id) ? `batch-result-${archetype.id}` : undefined} className="min-w-0">
          <input type="hidden" name={`baseline_${archetype.id}`} value={batch.baseline(archetype)} />
          <input name="archetype_ids" type="hidden" value={archetype.id} />
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,170px)_minmax(0,1fr)_minmax(0,120px)] xl:items-end">
            <FieldLabel>
              クラス
              <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-2">
                <ClassPicker compact defaultValue={archetype.class_name} name={`class_name_${archetype.id}`} />
              </div>
            </FieldLabel>
            <FieldLabel>
              標準デッキ名
              <Input name={`name_${archetype.id}`} defaultValue={archetype.name} required />
            </FieldLabel>
            <FieldLabel>
              表示順
              <Input name={`sort_order_${archetype.id}`} type="number" defaultValue={archetype.sort_order} />
            </FieldLabel>
            <div className="flex min-w-0 flex-wrap gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-ink xl:col-span-3">
              <label className="inline-flex items-center gap-2">
                <input name={`is_active_${archetype.id}`} type="checkbox" defaultChecked={archetype.is_active} />
                有効
              </label>
            </div>
          </div>
          </fieldset>
          <BatchRowResult row={batch.status(archetype.id)} />
        </section>
      ))}

      <div className="flex justify-end">
        <SubmitButton disabled={!batch.canSubmit} pendingLabel="一括更新中..." type="submit" variant="primary">
          {batch.label}
        </SubmitButton>
      </div>
    </form>
  );
}
