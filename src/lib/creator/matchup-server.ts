import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";
import { AnalysisDataError, parseAnalysisAggregates, buildAnalysisFromAggregates } from "@/lib/analysis-aggregates";
import { parseDataSelection, type MatchupData } from "./matchup-data";
import { UUID } from "./model";
import { databaseError } from "./server";

/** Called only after creatorClient. Same boundaries, reversed RPC and matrix builder as OBS. */
export async function getCreatorMatchups(client: SupabaseClient, selectionInput: unknown, imageIds: unknown): Promise<MatchupData> {
  const selection=parseDataSelection(selectionInput);
  if (!Array.isArray(imageIds) || imageIds.length>300 || imageIds.some(id=>typeof id!=="string" || !UUID.test(id))) throw Error("画像の指定が不正です。");
  const images=imageIds.length ? await client.from("creator_images").select("id,archetype_id").in("id",[...new Set(imageIds)]) : {data:[],error:null};
  databaseError(images.error);
  const imageDecks:Record<string,string|null>=Object.fromEntries((images.data??[]).map(i=>[i.id,i.archetype_id]));
  const dashboard=await getEnvironmentDashboard(selection);
  const decks=[...new Set(Object.values(imageDecks).filter((id):id is string=>!!id))].map(id=>({id,name:id,class_name:""}));
  const meta={selection,start:dashboard.current.start,end:dashboard.current.end,aggregatedAt:dashboard.aggregatedAt,imageDecks};
  if (!decks.length) return {...meta,cells:[]};
  const {data,error}=await client.rpc("get_analysis_aggregates_v3_exclusive",{
    p_environment_id:dashboard.environmentId,p_played_from:dashboard.current.start,p_played_to:dashboard.current.end,
    p_rank_filters:dashboard.rankFilters,p_include_all_users:true,p_include_reversed:true,p_use_archetype:true,
    p_recent_deck_ids:[],p_my_deck_id:null,p_opponent_deck_id:null,p_result:null,p_turn_order:null
  });
  if(error)throw new AnalysisDataError("database",error.code);
  const aggregates=parseAnalysisAggregates(data,[]);
  if(aggregates.perspectives!==aggregates.registeredMatches*2)throw new AnalysisDataError("invalid_response");
  return {...meta,cells:buildAnalysisFromAggregates(aggregates,decks,decks).matrix.flatMap(row=>row.cells.map(c=>({sourceDeckId:row.myDeck.id,targetDeckId:c.opponentDeckId,winRate:c.winRate,matchCount:c.total})))};
}
