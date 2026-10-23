import { getEnvironments } from "@/lib/data";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";
import { getObsEnvironmentMatchups, type ObsMatchups } from "@/lib/obs-environment-matchups";
import type { ObsSet } from "@/lib/creator/obs-set";
import { ObsEnvironmentView } from "@/components/environment/ObsEnvironmentView";
import { ScaledObsEnvironment } from "./ScaledObsEnvironment";

export async function ObsEnvironmentSection({ set }: { set: ObsSet }) {
  const environment = (await getEnvironments()).find(e => e.id === set.environment_id);
  let content;
  try {
    if (!environment) throw Error("環境が見つかりません。");
    const data = await getEnvironmentDashboard({ environment: environment.id, period: set.environment_period, ranks: set.environment_ranks });
    let matchups: ObsMatchups | null = null;
    try { matchups = await getObsEnvironmentMatchups(data); } catch { /* Same partial-error presentation as the standalone OBS page. */ }
    content = <ObsEnvironmentView data={data} environmentName={environment.name} matchups={matchups} embedded />;
  } catch {
    content = <div className="p-8 text-2xl text-white" role="alert">環境データを取得できませんでした。時間をおいてページを再読み込みしてください。</div>;
  }
  return <ScaledObsEnvironment>{content}</ScaledObsEnvironment>;
}
