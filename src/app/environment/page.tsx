import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EnvironmentFilters } from "@/components/environment/EnvironmentFilters";
import { getCurrentUser } from "@/lib/data";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import { environmentHref, normalizeEnvironmentPeriod, normalizeEnvironmentRank, type EnvironmentDashboard } from "@/lib/environment-dashboard";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "環境データ" };
export default async function EnvironmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) redirect("/login?message=" + encodeURIComponent("環境データは会員ログイン後に利用できます。"));
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: environments, error: environmentError } = await supabase.from("environments")
    .select("id,name,created_at,allow_match_input,match_input_start_at,match_input_end_at").order("created_at", { ascending: false });
  const environment = selectInitialEnvironmentId(environments ?? [], typeof params.environment === "string" ? params.environment : undefined);
  const selection = { environment, period: normalizeEnvironmentPeriod(params.period), rank: normalizeEnvironmentRank(params.rank) };
  if (environment && !environmentError && ["environment", "period", "rank"].some(k => params[k] !== undefined && params[k] !== selection[k as keyof typeof selection])) redirect(environmentHref(selection));
  let dashboard: EnvironmentDashboard | null = null, failed = Boolean(environmentError);
  if (environment && !failed) {
    try {
      dashboard = await getEnvironmentDashboard(selection);
    } catch { failed = true; }
  }
  return <AppShell navigationPrefetch={false}><div className="space-y-5">
    <div><h1 className="text-2xl font-bold">環境データ</h1><p className="mt-2 text-sm leading-relaxed text-muted">SV Match Log利用者が登録した戦績の集計データです。個別ユーザーの戦績や識別情報は表示しません。データ量の少ない項目は非表示になる場合があります。</p></div>
    <EnvironmentFilters key={environmentHref(selection)} environments={(environments ?? []).map(e => ({ id: e.id, name: e.name }))} initialSelection={selection} initialData={dashboard} initialFailed={failed} />
  </div></AppShell>;
}
