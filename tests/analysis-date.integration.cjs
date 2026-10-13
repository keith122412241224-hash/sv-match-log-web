/* eslint-disable @typescript-eslint/no-require-imports */
// Actual current RPCs on synthetic in-memory PostgreSQL; no external service access.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),cp=require('child_process'),Module=require('module'),ts=require('typescript');
process.env.PGLITE_MODULE ||= path.resolve('build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite');
const {setup,ids}=require('./match-mutations-db.cjs');
const {invalid,valid}=require('./analysis-date-cases.cjs');
const base='adc78e421fdbaddfd9b0218594ada5ab21d04319',out='build/qa2-005-analysis-date-validation';
const report={engine:'in-memory PGlite, current migrations, synthetic data only',comparisons:[],invalid:[],errors:[]};
test('Analysis dates preserve SQL aggregates and input/auth/server status boundaries',async()=>{
 const h=await setup(),db=h.db;let user={id:ids.a},failure=null,calls=[];
 const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
 const types=['uuid','boolean','boolean','boolean','uuid','uuid','public.match_result','public.turn_order','timestamptz','timestamptz','uuid[]','text[]'];
 const keys=['p_environment_id','p_include_all_users','p_include_reversed','p_use_archetype','p_my_deck_id','p_opponent_deck_id','p_result','p_turn_order','p_played_from','p_played_to','p_recent_deck_ids','p_rank_filters'];
 const client={auth:{getUser:async()=>({data:{user}})},from:table=>new h.Query(table),rpc:async(name,args)=>{calls.push(args);assert.equal(name,'get_analysis_aggregates_v3');if(failure==='transport')throw Error('PRIVATE');if(failure)return {error:{code:failure,message:'PRIVATE'}};return {data:(await db.query(`select public.get_analysis_aggregates_v3(${types.map((t,i)=>'$'+(i+1)+'::'+t).join(',')}) as data`,keys.map(k=>args[k]))).rows[0].data};}};
 mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>client});
 const React=require('react');mock('../src/components/AppShell',{AppShell:({children})=>React.createElement('main',null,children)});
 const {getAnalysisPageData:after}=require('../src/lib/analysis-page-data'),{GET}=require('../src/app/api/analysis/route'),Page=require('../src/app/analysis/page').default,{renderToStaticMarkup:render}=require('react-dom/server');
 const oldSource=cp.execFileSync('git',['show',base+':src/lib/analysis-page-data.ts'],{encoding:'utf8'}),old=new Module(path.resolve('src/lib/__date_baseline.ts'),module);old.filename=path.resolve('src/lib/__date_baseline.ts');old.paths=module.paths;old._compile(ts.transpileModule(oldSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,old.filename);const before=old.exports.getAnalysisPageData;
 try{
 await db.exec('reset role;truncate public.matches');
 const times=['2025-12-31T14:59:59.999999Z','2025-12-31T15:00:00Z','2025-12-31T15:00:59.999Z','2025-12-31T15:00:59.999999Z','2025-12-31T15:01:00Z','2026-02-28T14:59:59Z','2026-02-28T15:00:00Z','2026-04-30T15:00:00Z','2026-12-31T15:00:00Z','2024-02-28T15:00:00Z','2000-02-28T15:00:00Z'];
 let n=100;
 for(const played of times)for(let i=0;i<4;i++)await db.query(`insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,['00000000-0000-4000-8000-'+String(n++).padStart(12,'0'),i===3?ids.b:ids.a,i===2?ids.env2:ids.env,i===3?ids.bdeck:ids.deck,ids.deck2,ids.arch,i===1?ids.arch:ids.arch2,i%2?'lose':'win',i%2?'second':'first',played,i%2?'a':'beginner']);
 const snapshot=JSON.stringify((await db.query('select * from public.matches order by id')).rows);
 await h.claim();
 const modes=[{}, {scope:'all',winRateMode:'combined'}, {ranks:'a'}, {ranks:'beginner,a',scope:'all',myDeck:ids.arch,opponentDeck:ids.arch2,result:'lose',turnOrder:'second',winRateMode:'combined'}, {environment:ids.env2}, {scope:'all',myDeck:ids.arch,opponentDeck:ids.arch,winRateMode:'combined'}];
 for(const dates of valid)for(const filters of modes){const params={environment:ids.env,...filters,...dates};calls=[];const a=await before(params),oldArgs=calls.at(-1);const b=await after(params);assert.deepEqual(b,a);assert.deepEqual(calls.at(-1),oldArgs);report.comparisons.push({params,registeredMatches:b.aggregates.registeredMatches,perspectives:b.aggregates.perspectives,totalWins:b.aggregates.totalWins,allFieldsEqual:true,rpcArgsEqual:true});}
 const one=await after({environment:ids.env,playedFrom:'2026-01-01T00:00',playedTo:'2026-01-01T00:00'});assert.equal(one.aggregates.registeredMatches,4,'includes .999, excludes .999999 at end minute');
 for(const [i,raw]of invalid.entries())for(const field of ['playedFrom','playedTo']){const params={environment:ids.env,ranks:'a',[field]:raw},q=new URLSearchParams({environment:ids.env,ranks:'a'});for(const value of Array.isArray(raw)?raw:[raw])q.append(field,value);calls=[];const response=await GET(new Request('http://localhost/api/analysis?'+q));assert.equal(response.status,400);const body=await response.json();assert.equal(body.field,field);assert.equal(calls.length,0);const html=render(await Page({searchParams:Promise.resolve(params)}));assert.match(html,/role="alert"/);assert.match(html,/name="ranks" value="a"/);assert.doesNotMatch(html,/対象登録戦績:|<script>/);assert.equal(calls.length,0);report.invalid.push({case:i,field,api:400,page:'recoverable error',rpcCalls:0});}
 calls=[];assert.equal((await GET(new Request('http://localhost/api/analysis?playedFrom=2026-01-02T00:00&playedTo=2026-01-01T00:00'))).status,400);assert.equal(calls.length,0);
 for(const mode of ['42501','PGRST202','XX000','transport']){failure=mode;const response=await GET(new Request('http://localhost/api/analysis'));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE|SELECT|stack/);report.errors.push({mode,status:503});}failure=null;
 user=null;calls=[];assert.equal((await GET(new Request('http://localhost/api/analysis?playedFrom=bad'))).status,401);assert.equal(calls.length,0);report.errors.push({mode:'unauthenticated invalid input',status:401});
 user={id:ids.b};await h.claim(ids.b);const member=await after({scope:'all'});assert.equal(member.selectedScope,'mine');assert.equal(member.isAdmin,false);report.memberScope='mine';
 user={id:ids.a};await h.claim();const success=await GET(new Request('http://localhost/api/analysis'));assert.equal(success.status,200);assert.equal(success.headers.get('cache-control'),'private, no-store');assert.equal(success.headers.get('vary'),'Cookie');
 await db.exec('reset role');assert.equal(JSON.stringify((await db.query('select * from public.matches order by id')).rows),snapshot);report.dataUnchanged=true;report.completed=true;
 }finally{await db.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/valid-date-comparison.json',JSON.stringify(report,null,2));fs.writeFileSync(out+'/invalid-query-cases.json',JSON.stringify(report.invalid,null,2));}
});
