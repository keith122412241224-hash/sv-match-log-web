import { buildReviewSnapshotV2, type ReviewSourceV2 } from "./data-model";
import type { ReviewSnapshot, ReviewSource } from "./metrics";

type Cell = ReviewSource["cells"][number];
export type CatalogDeck = { id: string; name: string; class_name: string; is_active: boolean; is_other: boolean };
export type Observation = Omit<Cell, "recent"> & { user: string; window: 0 | 7 | 3 };
type UserTotals = { total: number; wins: number; pilot: boolean; upper: boolean; upperPilot: boolean; otherRank: boolean };
type Users = Map<string, Map<string, UserTotals>>;
type Environment = { environmentId: string; environmentName: string; environmentStart: string; asOf: string };

export function periodStarts(start: string, end: string) {
  const first = Date.parse(start), last = Date.parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) throw Error("環境の集計期間が不正です。");
  const daysAgo = (days: number) => new Date(Math.max(first, last - days * 86400000)).toISOString();
  return { week: daysAgo(7), recent: daysAgo(3) };
}

// Contributor identifiers exist only during server-side aggregation.
function add(users: Users, key: string, row: Observation, wins: number, direct: boolean) {
  const group = users.get(key) ?? new Map<string, UserTotals>();
  const entry = group.get(row.user) ?? {total:0,wins:0,pilot:false,upper:false,upperPilot:false,otherRank:false};
  const upper = row.rank.startsWith("grandmaster:");
  entry.total += row.total;
  entry.wins += wins;
  entry.pilot ||= direct;
  entry.upper ||= upper;
  entry.upperPilot ||= upper && direct;
  entry.otherRank ||= !upper && row.rank !== "unranked";
  group.set(row.user, entry);
  users.set(key, group);
}

function bias(users?: Map<string, UserTotals>) {
  const entries = [...(users?.values() ?? [])].sort((a,b) => b.total-a.total || b.wins-a.wins);
  const n = entries.reduce((sum,x) => sum+x.total, 0);
  const rest = n - (entries[0]?.total ?? 0);
  return {
    contributors:entries.length, pilots:entries.filter(x=>x.pilot).length,
    topContributorShare:n ? 100*entries[0].total/n : null,
    userEqualWinRate:n ? entries.reduce((sum,x)=>sum+100*x.wins/x.total,0)/entries.length : null,
    withoutLargestWinRate:rest ? 100*entries.slice(1).reduce((sum,x)=>sum+x.wins,0)/rest : null,
    upperContributors:entries.filter(x=>x.upper).length, upperPilots:entries.filter(x=>x.upperPilot).length,
    otherRankContributors:entries.filter(x=>x.otherRank).length
  };
}

export function periodSource(env: Environment, catalog: CatalogDeck[], rows: Observation[], start: string): ReviewSourceV2 {
  const decks = new Map(catalog.map(d=>[d.id,d]));
  const counts = new Map<string, Cell>();
  const display: Users = new Map(), eligible: Users = new Map(), pairUsers: Users = new Map();
  for (const row of rows) {
    const {my,opp,wins,total,day,turn,rank} = row;
    const recent = row.window === 3;
    const key = JSON.stringify([day,recent,my,opp,rank,turn]);
    const cell = counts.get(key) ?? {day,recent,my,opp,rank,turn,total:0,wins:0};
    cell.total += total;
    cell.wins += wins;
    counts.set(key,cell);
    if (my) add(display,my,row,wins,true);
    if (opp) add(display,opp,row,total-wins,false);
    if (!my || !opp || my===opp) continue;
    const direct = my < opp;
    const pair = direct ? my+"::"+opp : opp+"::"+my;
    const pairWins = direct ? wins : total-wins;
    add(pairUsers,pair,row,pairWins,direct);
    if (!decks.get(my)?.is_other && !decks.get(opp)?.is_other) {
      add(eligible,my,row,wins,true);
      add(eligible,opp,row,total-wins,false);
      add(eligible,pair,row,pairWins,direct);
    }
  }
  return {...env, periodStart:start, shortPeriodStart:periodStarts(start,env.asOf).recent,
    contributors:new Set(rows.map(r=>r.user)).size, cells:[...counts.values()],
    decks:catalog.filter(d=>d.is_active || display.has(d.id)).map(d=>{
      const {contributors,pilots,topContributorShare,userEqualWinRate} = bias(display.get(d.id));
      return {deckId:d.id,name:d.name,className:d.class_name,isOther:d.is_other,contributors,pilots,topContributorShare,userEqualWinRate};
    }),
    pairBias:[...pairUsers].map(([key,group])=>{
      const [a,b] = key.split("::");
      const {contributors,topContributorShare,userEqualWinRate} = bias(group);
      return {a,b,contributors,topContributorShare:topContributorShare!,userEqualWinRate:userEqualWinRate!};
    }),
    eligibleBias:[...eligible].map(([key,group])=>({key,...bias(group)}))
  };
}

export function buildPeriodSnapshot(env: Environment, catalog: CatalogDeck[], rows: Observation[], id: string): ReviewSnapshot {
  const start = periodStarts(env.environmentStart,env.asOf).week;
  const full = buildReviewSnapshotV2(periodSource(env,catalog,rows,env.environmentStart),id);
  const week = buildReviewSnapshotV2(periodSource(env,catalog,rows.filter(r=>r.window!==0),start),id);
  return {...full, weekly:{start,matchCount:week.matchCount,
    decks:week.decks.map(({deckId,count,winRate,encounters,encounterRate,eligibleCount,eligibleWinRate})=>
      ({deckId,count,winRate,encounters,encounterRate,eligibleCount,eligibleWinRate})),
    pairs:week.pairs.map(({a,b,count,wins,winRate})=>({a,b,count,wins,winRate}))}};
}
