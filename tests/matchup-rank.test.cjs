/* eslint-disable @typescript-eslint/no-require-imports */
const { legacySourcePath } = require('./legacy-source.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
let calls=[],error=null,data={version:1,totalMatches:0,groups:[]};
mock('../src/lib/data',{getCurrentUser:async()=>({id:'owner'})});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return{data,error};}})});
const {getMatchupAggregates}=require('../src/lib/matchup-data');
test('matrix all retains v1; each R3-A rank option makes exactly one v2 request with the same scope/environment',async()=>{
 for(const all of [false,true])for(const {value}of ANALYSIS_RANK_FILTERS){calls=[];await getMatchupAggregates('env',all,value);assert.deepEqual(calls,[{name:value==='all'?'get_matchup_aggregates_v1':'get_matchup_aggregates_v2',args:{...(value==='all'?{}:{p_rank_filter:value}),p_environment_id:'env',p_include_all_users:all}}]);}
 calls=[];await getMatchupAggregates();assert.equal(calls[0].name,'get_matchup_aggregates_v1');assert.equal(calls[0].args.p_environment_id,null);
});
test('matrix invalid filter, missing/denied RPC and corrupt totals never silently fall back or become zero',async()=>{
 calls=[];await assert.rejects(()=>getMatchupAggregates('',true,'none'));assert.equal(calls.length,0);
 for(const code of ['PGRST202','42501','22023']){error={code};calls=[];await assert.rejects(()=>getMatchupAggregates('',true,'grandmaster:none'));assert.equal(calls.length,1);assert.equal(calls[0].name,'get_matchup_aggregates_v2');}error=null;
 data={version:1,totalMatches:1,groups:[]};await assert.rejects(()=>getMatchupAggregates('',false,'master'));data={version:1,totalMatches:0,groups:[]};
});
test('R3-B preserves every existing Production source/schema file except two matrix entry points',()=>{
 const base='8eac48bca95c6f0dd74e55e590694f03b7fde0dc',git=a=>cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...a],{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 // R4 changes only period entry points; period-report-rank.test.cjs protects all other source.
  // Matrix creation-date hydration fix is guarded by matrix-created-date.test.cjs.
 const allowed=new Set(["src/components/MatchupMatrix.tsx","src/app/admin/weekly-report/page.tsx","src/components/admin/WeeklyReportClientTools.tsx","src/lib/data.ts","src/lib/period-report-data.ts",'src/app/matrix/page.tsx','src/lib/matchup-data.ts']);
 for(const file of git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>f.startsWith('src/')||f.startsWith('supabase/')||['package.json','package-lock.json'].includes(f)))if(!allowed.has(file))assert.equal(fs.readFileSync(legacySourcePath(file),'utf8').replaceAll('\r\n','\n'),git(['show',base+':'+file]),file);
 const sql=fs.readFileSync('supabase/legacy-migrations/pre-baseline/017_matchup_rank_aggregates_v2.sql','utf8').replace(/--[^\n]*/g,'');assert.equal((sql.match(/create or replace function/g)||[]).length,1);assert.doesNotMatch(sql,/\b(alter|drop|insert|update|delete|truncate|trigger|index|policy)\b/i);
});
