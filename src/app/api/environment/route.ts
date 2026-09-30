import { getCurrentUser } from "@/lib/data";
import { ENVIRONMENT_PERIODS, ENVIRONMENT_RANKS, normalizeEnvironmentPeriod, normalizeEnvironmentRank } from "@/lib/environment-dashboard";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) return reply({ error: "会員ログインが必要です。" }, 401);
  const p = new URL(request.url).searchParams;
  const environment = p.get("environment") ?? "";
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(environment)
    || !ENVIRONMENT_PERIODS.some(v => v.value === p.get("period")) || !ENVIRONMENT_RANKS.some(v => v.value === p.get("rank"))
    || [...p.keys()].some(k => !["environment", "period", "rank"].includes(k) || p.getAll(k).length !== 1)) return reply({ error: "集計条件が不正です。" }, 400);
  try {
    return reply(await getEnvironmentDashboard({ environment, period: normalizeEnvironmentPeriod(p.get("period")), rank: normalizeEnvironmentRank(p.get("rank")) }), 200);
  } catch { return reply({ error: "環境データを取得できませんでした。" }, 503); }
}
