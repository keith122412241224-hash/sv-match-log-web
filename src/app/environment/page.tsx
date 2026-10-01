import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EnvironmentFilters } from "@/components/environment/EnvironmentFilters";
import { getCurrentUser } from "@/lib/data";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import { normalizeEnvironmentPeriod } from "@/lib/environment-dashboard";
import { environmentHrefV2 } from "@/lib/environment-dashboard-v2";
import { parseRankSelection } from "@/lib/rank-selection";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { EnvironmentDashboardV3 } from "@/lib/environment-dashboard-v3";

export const metadata = { title: "環境データ" };
export default async function EnvironmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) redirect("/login?message=" + encodeURIComponent("環境データは会員ログイン後に利用できます。"));
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: environments, error: environmentError }, { data: activeArchetypes, error: archetypeError }] = await Promise.all([
    supabase.from("environments")
      .select("id,name,created_at,allow_match_input,match_input_start_at,match_input_end_at").order("created_at", { ascending: false }),
    supabase.from("deck_archetypes").select("id").eq("is_active", true)
  ]);
  if (archetypeError) throw new Error("デッキ分類を取得できませんでした。");
  const environment = selectInitialEnvironmentId(environments ?? [], typeof params.environment === "string" ? params.environment : undefined);
  let ranks;
  try { ranks = parseRankSelection(params); }
  catch { return <AppShell><div role="alert" className="rounded-md border p-4">ランクの絞り込み条件が不正です。URLのランク指定を確認してください。</div></AppShell>; }
  const selection = { environment, period: normalizeEnvironmentPeriod(params.period), ranks };
  if (environment && !environmentError && ["environment", "period"].some(k => params[k] !== undefined && params[k] !== selection[k as "environment" | "period"])) redirect(environmentHrefV2(selection));
  let dashboard: EnvironmentDashboardV3 | null = null, failed = Boolean(environmentError);
  if (environment && !failed) {
    try {
      dashboard = await getEnvironmentDashboard(selection);
    } catch { failed = true; }
  }
  return <AppShell navigationPrefetch={false}><div className="space-y-5">
    <div><h1 className="text-2xl font-bold">環境データ</h1><p className="mt-2 text-sm leading-relaxed text-muted">SV Match Log利用者が登録した戦績の集計データです。個別ユーザーの戦績や識別情報は表示しません。集計値とあわせて件数を表示しています。</p></div>
    <EnvironmentFilters key={environmentHrefV2(selection)} environments={(environments ?? []).map(e => ({ id: e.id, name: e.name }))} activeDeckIds={(activeArchetypes ?? []).map(a => a.id)} initialSelection={selection} initialData={dashboard} initialFailed={failed} />
  </div></AppShell>;
}
