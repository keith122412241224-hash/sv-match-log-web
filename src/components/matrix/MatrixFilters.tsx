"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { serializeRankSelection, type RankSelection } from "@/lib/rank-selection";
import type { Environment } from "@/types/database";

export function MatrixFilters({
  environments,
  selectedEnvironmentId,
  ranks,
  canUseAllUsers,
  scope = "mine"
}: {
  environments: Environment[];
  selectedEnvironmentId?: string;
  ranks: RankSelection;
  canUseAllUsers?: boolean;
  scope?: "mine" | "all";
}) {
  const selectedId = selectedEnvironmentId || environments[0]?.id || "";
  const form = useRef<HTMLFormElement>(null), router = useRouter();
  const [pending, startTransition] = useTransition();
  function applyRanks(next: RankSelection) {
    if (!form.current || pending) return;
    const data = new FormData(form.current);
    const query = new URLSearchParams({ environment: String(data.get("environment") ?? ""), scope: String(data.get("scope") ?? "mine"), ranks: serializeRankSelection(next) });
    startTransition(() => router.push(`/matrix?${query}`));
  }

  return (
    <form
      ref={form}
      action="/matrix"
      className={
        canUseAllUsers
          ? "grid min-w-0 gap-2 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto] lg:items-end"
          : "grid min-w-0 gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end"
      }
    >
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">
        表示する環境
        <select
          className="min-h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
          disabled={pending}
          name="environment"
          defaultValue={selectedId}
        >
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </label>
      {canUseAllUsers ? (
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          集計範囲
          <select
            className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            name="scope"
            disabled={pending}
            defaultValue={scope}
          >
            <option value="mine">自分のみ</option>
            <option value="all">全ユーザー</option>
          </select>
        </label>
      ) : null}
      <RankMultiSelect value={ranks} onApply={applyRanks} disabled={pending || !selectedId} />
      <button disabled={pending || !selectedId} className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-60" type="submit">
        表示
      </button>
    </form>
  );
}
