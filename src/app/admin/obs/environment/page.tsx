import { redirect } from "next/navigation";
import { getCurrentUser, getEnvironments, getIsAdmin } from "@/lib/data";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";
import { normalizeEnvironmentPeriod } from "@/lib/environment-dashboard";
import { environmentHrefV2 } from "@/lib/environment-dashboard-v2";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import { parseRankSelection } from "@/lib/rank-selection";
import { ObsEnvironmentView } from "@/components/environment/ObsEnvironmentView";
import { getObsEnvironmentMatchups, type ObsMatchups } from "@/lib/obs-environment-matchups";

export const metadata = { title: "OBS 環境データ", robots: { index: false, follow: false } };

function Message({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 p-8 text-2xl text-white"><h1 className="mb-5 font-bold">SV Match Log · 環境データ</h1><p role="alert">{children}</p></main>;
}

export default async function ObsEnvironmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) redirect("/login?message=" + encodeURIComponent("OBS表示には管理者ログインが必要です。ログイン後、OBS表示のURLを開き直してください。"));
  if (!await getIsAdmin()) redirect("/");
  const [params, environments] = await Promise.all([searchParams, getEnvironments()]);
  let ranks;
  try { ranks = parseRankSelection(params); }
  catch { return <Message>ランクの絞り込み条件が不正です。URLのランク指定を確認してください。</Message>; }
  const environment = selectInitialEnvironmentId(environments, typeof params.environment === "string" ? params.environment : undefined);
  if (!environment) return <Message>選択できる環境がありません。</Message>;
  const selection = { environment, period: normalizeEnvironmentPeriod(params.period), ranks };
  if (["environment", "period"].some(k => params[k] !== undefined && params[k] !== selection[k as "environment" | "period"])) {
    redirect(`/admin/obs${environmentHrefV2(selection)}`);
  }
  let dashboard;
  try { dashboard = await getEnvironmentDashboard(selection); }
  catch { return <Message>環境データを取得できませんでした。時間をおいてページを再読み込みしてください。</Message>; }
  let matchups: ObsMatchups | null = null;
  try { matchups = await getObsEnvironmentMatchups(dashboard); }
  catch { /* Preserve the upper dashboard and display a separate matchup error. */ }
  return <ObsEnvironmentView data={dashboard} environmentName={environments.find(e => e.id === environment)!.name} matchups={matchups} />;
}
