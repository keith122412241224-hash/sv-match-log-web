/* eslint-disable @typescript-eslint/no-require-imports */
const { legacySourcePath } = require('./legacy-source.cjs');
const { readBeforeRouteLoading } = require('./route-loading-scope.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {ANALYSIS_RANK_FILTERS,parseAnalysisRankFilter}=require('../src/lib/analysis-rank-filter');
const {MASTER_GROUPS,GRANDMASTER_RATINGS}=require('../src/constants/ranks');
const {RANKS}=require('../src/constants/ranks');
const {ANALYSIS_PAGE_RANK_FILTERS,parseAnalysisPageRankFilter}=require('../src/lib/analysis-page-rank-filter');

test('analysis adds every existing base tier without changing other reports or legacy choices',()=>{
 const lower=RANKS.filter(x=>!['master','grandmaster'].includes(x.value));
 assert.deepEqual(ANALYSIS_PAGE_RANK_FILTERS.map(x=>x.value),['all',...lower.map(x=>x.value),...ANALYSIS_RANK_FILTERS.slice(1).map(x=>x.value)]);
 for(const tier of lower){assert.equal(ANALYSIS_PAGE_RANK_FILTERS.find(x=>x.value===tier.value).label,tier.label);assert.throws(()=>parseAnalysisRankFilter(tier.value));}
 for(const option of ANALYSIS_RANK_FILTERS)assert.deepEqual(ANALYSIS_PAGE_RANK_FILTERS.find(x=>x.value===option.value),option);
 for(const {value}of ANALYSIS_PAGE_RANK_FILTERS)assert.equal(parseAnalysisPageRankFilter(value),value);
 for(const value of [undefined,null,'','all'])assert.equal(parseAnalysisPageRankFilter(value),'all');
 for(const value of ['master-below','none','aa:1','AA','unknown'])assert.throws(()=>parseAnalysisPageRankFilter(value));
});

test('tier migration only expands the analysis rank allowlist and source predicate',()=>{
 const read=f=>fs.readFileSync(f,'utf8').replaceAll('\r\n','\n');
 const baseline=read('supabase/migrations/20260928010000_production_baseline.sql');
 const start=baseline.indexOf('CREATE OR REPLACE FUNCTION public.get_analysis_aggregates_v2(');
 const original=baseline.slice(start,baseline.indexOf('$function$;',start)+11);
 const expected=original.replace("not in ('all',", "not in ('beginner', 'd', 'c', 'b', 'a', 'aa', 'all',")
   .replace("      or (p_rank_filter = 'master-plus'", "      or (p_rank_filter in ('beginner', 'd', 'c', 'b', 'a', 'aa') and m.rank_tier = p_rank_filter)\n      or (p_rank_filter = 'master-plus'");
 const migration=read('supabase/migrations/20260929053719_analysis_rank_tiers.sql');
 assert.equal(migration.slice(migration.indexOf('CREATE OR REPLACE')).trim(),expected);
});
test('14 rank filters derive the existing R2 child values, and NULL differs from explicit none',()=>{
 assert.deepEqual(ANALYSIS_RANK_FILTERS.map(x=>x.value),['all','master-plus','master','grandmaster',...MASTER_GROUPS.map(x=>'master:'+x.value),...GRANDMASTER_RATINGS.map(x=>'grandmaster:'+x.value)]);
 for(const v of [null,undefined,'','all'])assert.equal(parseAnalysisRankFilter(v),'all');
 for(const {value}of ANALYSIS_RANK_FILTERS)assert.equal(parseAnalysisRankFilter(value),value);
 for(const v of ['none','null','master:none','grandmaster:emerald','MASTER','invalid'])assert.throws(()=>parseAnalysisRankFilter(v));
});
const mock=(p,value)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports:value};};
let calls=[],error=null;const {emptyAnalysisAggregates}=require('../src/lib/analysis-aggregates');
mock('../src/lib/data',{getCurrentUser:async()=>({id:'owner'})});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:emptyAnalysisAggregates(),error};}})});
const {getAnalysisAggregates}=require('../src/lib/analysis-data');
test('all uses unchanged v1; selected rank uses one v2 call retaining every v1 argument',async()=>{
 for(const {value}of ANALYSIS_PAGE_RANK_FILTERS){calls=[];await getAnalysisAggregates('environment','combined',{includeAllUsers:true,deckIdField:'archetype',myDeckId:'A',opponentDeckId:'B',result:'lose',turnOrder:'second',playedAtFrom:'from',playedAtTo:'to'},[],value);
 assert.equal(calls.length,1);assert.equal(calls[0].name,value==='all'?'get_analysis_aggregates_v1':'get_analysis_aggregates_v2');
 assert.deepEqual(calls[0].args,{...(value==='all'?{}:{p_rank_filter:value}),p_environment_id:'environment',p_include_all_users:true,p_include_reversed:true,p_use_archetype:true,p_my_deck_id:'A',p_opponent_deck_id:'B',p_result:'lose',p_turn_order:'second',p_played_from:'from',p_played_to:'to',p_recent_deck_ids:[]});}
});
test('missing or denied v2 does not fall back to all or zero',async()=>{
 for(const code of ['PGRST202','42501','22023']){calls=[];error={code};await assert.rejects(()=>getAnalysisAggregates('','direct',{},[],'master'));assert.equal(calls.length,1);assert.equal(calls[0].name,'get_analysis_aggregates_v2');}error=null;
});
test('v2 changes only source selection; every perspective/group/recent/output SQL byte matches v1',()=>{
 const read=f=>fs.readFileSync(legacySourcePath(f),'utf8').replaceAll('\r\n','\n');
 const v1=read('tests/fixtures/analysis-aggregates-v1.sql'),v2=read('supabase/legacy-migrations/pre-baseline/016_analysis_rank_aggregates_v2.sql');
 const body=s=>s.slice(s.indexOf('), perspectives as'),s.indexOf('from ordered'));
 assert.equal(body(v2),body(v1));assert.equal((v2.match(/create or replace function/g)||[]).length,1);
 assert.doesNotMatch(v2.replace(/--[^\n]*/g,''),/\b(alter|drop|insert|update|delete|truncate|trigger|index|policy)\b/i);
});
// R3-B adapts only matrix entry points; matchup-rank.test.cjs freezes all other Production source.
test('R3-A and R3-B entry points are isolated; R2 and other Phase A/C code remain byte-identical',()=>{
 const base='27f3dbb4b14706774d63dbd26282803a7ca0e8c4';const git=a=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 // R4 changes only period entry points; period-report-rank.test.cjs protects all other source.
  // Matrix creation-date hydration fix is guarded by matrix-created-date.test.cjs.
 // Save UX exceptions are narrowly guarded by global-pending-scope.test.cjs.
 const allowed=new Set([...require('./rescue-scope.cjs').rescueSources,"src/app/page.tsx","src/app/analysis/page.tsx","src/app/matrix/page.tsx","src/app/actions.ts","src/app/admin/actions.ts","src/app/admin/page.tsx","src/app/guest/page.tsx","src/app/matches/page.tsx","src/components/admin/AdminEnvironmentTable.tsx","src/components/admin/CreateEnvironmentForm.tsx","src/lib/data.ts","src/types/database.ts","src/app/actions.ts","src/components/GlobalPendingIndicator.tsx","src/components/matches/QuickMatchForm.tsx","src/components/MatchupMatrix.tsx","src/app/admin/weekly-report/page.tsx","src/components/admin/WeeklyReportClientTools.tsx","src/lib/data.ts","src/lib/period-report-data.ts",'src/app/matrix/page.tsx', 'src/lib/matchup-data.ts', 'src/app/analysis/page.tsx','src/lib/analysis-data.ts','src/components/analysis/AnalysisFilters.tsx']);
 for(const file of git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>f.startsWith('src/')||f.startsWith('supabase/')||f==='tests/fixtures/analysis-aggregates-v1.sql')){
 // Match entry rank UI is now guarded against the current Production baseline.
 if(!allowed.has(file) && file !== 'src/components/matches/RankFields.tsx'){
  let actual=readBeforeRouteLoading(legacySourcePath(file));
  // E1 adds only a member navigation item and its session-refresh route.
  // Normalize those exact additions; continue protecting every other byte.
  if(file==='src/components/AppShell.tsx')actual=actual
   .replace('export async function AppShell({ children, navigationPrefetch = true }: { children: ReactNode; navigationPrefetch?: boolean })','export async function AppShell({ children }: { children: ReactNode })')
   .replace('  { href: "/environment", label: "環境", icon: BarChart3 },\n','')
   .replace('navItems.filter((item) => (item.href !== "/admin" || isAdmin)\n    && (item.href !== "/environment" || user.is_anonymous === false))','navItems.filter((item) => item.href !== "/admin" || isAdmin)')
   .replace('navigationPrefetch && !["/analysis", "/matrix", "/environment", "/admin"]','!["/analysis", "/matrix", "/admin"]');
  if(file==='src/middleware.ts')actual=actual.replace(', "/environment/:path*"','');
  assert.equal(actual,git(['show',base+':'+file]),file);
 }
 }
});
