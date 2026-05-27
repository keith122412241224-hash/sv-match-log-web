import type { Environment } from "@/types/database";

export function EnvironmentFilter({
  environments,
  selectedEnvironmentId,
  basePath
}: {
  environments: Environment[];
  selectedEnvironmentId?: string;
  basePath: string;
}) {
  return (
    <form action={basePath} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm font-semibold text-ink">
        表示する環境
        <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base" name="environment" defaultValue={selectedEnvironmentId ?? ""}>
          <option value="">全環境</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </label>
      <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
        表示
      </button>
    </form>
  );
}
