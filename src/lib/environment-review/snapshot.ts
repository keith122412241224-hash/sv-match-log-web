import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/data";
import { buildPeriodSnapshot, periodStarts, type CatalogDeck, type Observation } from "./period-source";

export async function collectReviewSnapshot(environmentId: string) {
  if (!await getIsAdmin()) throw new Error("管理者権限が必要です。");
  const supabase = await createSupabaseServerClient();
  const requested = Date.now();
  const {data: env, error} = await supabase.from("environments")
    .select("id,name,start_date,created_at,match_input_start_at,dashboard_end_at").eq("id",environmentId).single();
  if (error || !env) throw new Error("環境の集計期間を確認できませんでした。");
  const end = Math.min(requested, env.dashboard_end_at ? Date.parse(env.dashboard_end_at) : requested);
  const asOf = new Date(end).toISOString();
  const calendarStart = env.start_date ? Date.parse(env.start_date.slice(0,10)+"T00:00:00+09:00") : Date.parse(env.created_at);
  // An input schedule can be reopened later in the season. Only use its time
  // of day to refine the recorded opening date when the dates agree.
  const input = Date.parse(env.match_input_start_at ?? "");
  const start = input >= calendarStart && input < calendarStart+86400000 ? input : calendarStart;
  const environmentStart = new Date(start).toISOString();
  const {week,recent} = periodStarts(environmentStart,asOf);
  const catalog: CatalogDeck[] = [];
  const pageSize = 500;
  for (let offset=0; ; offset+=pageSize) {
    const page = await supabase.from("deck_archetypes").select("id,name,class_name,is_active,is_other")
      .or("environment_id.is.null,environment_id.eq."+environmentId).lt("created_at",asOf)
      .order("id").range(offset,offset+pageSize-1);
    if (page.error || !page.data) throw new Error("デッキマスタを取得できませんでした。");
    catalog.push(...page.data);
    if (page.data.length < pageSize) break;
  }
  const known = new Set(catalog.map(d=>d.id));
  const rows: Observation[] = [];
  const weekAt = Date.parse(week), recentAt = Date.parse(recent);
  let last: string | undefined;
  let expected: number | null = null;
  for (;;) {
    let query = supabase.from("matches")
      .select("id,user_id,my_archetype_id,opponent_archetype_id,played_at,turn_order,result,rank_tier,master_group,grandmaster_rating", {count:last ? undefined : "exact"})
      .eq("environment_id",environmentId).gte("played_at",environmentStart).lt("played_at",asOf).lt("created_at",asOf)
      .order("id").limit(pageSize);
    if (last) query = query.gt("id",last);
    const page = await query;
    if (page.error || !page.data) throw new Error("戦績を取得できませんでした。再試行してください。");
    if (!last) expected = page.count;
    for (const m of page.data) {
      const played = Date.parse(m.played_at);
      const rank = m.rank_tier === "master" ? "master:"+m.master_group :
        m.rank_tier === "grandmaster" ? "grandmaster:"+m.grandmaster_rating : m.rank_tier ?? "unranked";
      rows.push({my:known.has(m.my_archetype_id) ? m.my_archetype_id : null, opp:known.has(m.opponent_archetype_id) ? m.opponent_archetype_id : null,
        user:m.user_id, day:new Date(played+9*3600000).toISOString().slice(0,10), window:played>=recentAt ? 3 : played>=weekAt ? 7 : 0,
        rank, turn:m.turn_order, total:1, wins:m.result==="win" ? 1 : 0});
    }
    if (rows.length===expected || !page.data.length) break;
    last = page.data[page.data.length-1].id;
  }
  if (expected===null || expected!==rows.length) throw new Error("集計中に戦績件数が変わりました。再作成してください。");
  // A retry in the same half hour with identical inputs resolves to the
  // original snapshot. New observations or changed window membership get a new ID.
  const hash = createHash("sha256").update(JSON.stringify([environmentId,environmentStart,Math.floor(end/1800000),catalog,rows])).digest("hex");
  const id = [hash.slice(0,8),hash.slice(8,12),"4"+hash.slice(13,16),"8"+hash.slice(17,20),hash.slice(20,32)].join("-");
  return buildPeriodSnapshot({environmentId,environmentName:env.name,environmentStart,asOf},catalog,rows,id);
}
