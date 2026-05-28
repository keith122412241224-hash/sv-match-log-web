import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StagingDebugPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const adminResult = user
    ? await supabase.from("admin_users").select("id, user_id").eq("user_id", user.id).maybeSingle()
    : { data: null, error: null };
  const environmentsResult = await supabase.from("environments").select("id, name", { count: "exact" }).limit(5);
  const archetypesResult = await supabase
    .from("deck_archetypes")
    .select("id, class_name, name, is_active", { count: "exact" })
    .eq("is_active", true)
    .limit(10);

  return (
    <main className="min-h-screen bg-surface p-6 text-ink">
      <div className="mx-auto grid max-w-4xl gap-4">
        <h1 className="text-2xl font-bold">Staging Debug</h1>
        <DebugBlock
          title="Environment"
          rows={[
            ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)"],
            ["VERCEL_ENV", process.env.VERCEL_ENV ?? "(missing)"],
            ["VERCEL_GIT_COMMIT_REF", process.env.VERCEL_GIT_COMMIT_REF ?? "(missing)"]
          ]}
        />
        <DebugBlock
          title="User"
          rows={[
            ["email", user?.email ?? "(not signed in)"],
            ["id", user?.id ?? "(not signed in)"],
            ["user error", userError?.message ?? "-"]
          ]}
        />
        <DebugBlock
          title="Admin"
          rows={[
            ["is admin", adminResult.data ? "true" : "false"],
            ["admin error", adminResult.error?.message ?? "-"]
          ]}
        />
        <DebugBlock
          title="Data"
          rows={[
            ["environments count", String(environmentsResult.count ?? 0)],
            ["environments error", environmentsResult.error?.message ?? "-"],
            ["active archetypes count", String(archetypesResult.count ?? 0)],
            ["archetypes error", archetypesResult.error?.message ?? "-"]
          ]}
        />
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="font-bold">Sample Environments</h2>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white">
            {JSON.stringify(environmentsResult.data ?? [], null, 2)}
          </pre>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="font-bold">Sample Active Archetypes</h2>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white">
            {JSON.stringify(archetypesResult.data ?? [], null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}

function DebugBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="font-bold">{title}</h2>
      <dl className="mt-3 grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div className="grid gap-1 sm:grid-cols-[220px_1fr]" key={label}>
            <dt className="font-semibold text-muted">{label}</dt>
            <dd className="break-all font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
