/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const boundary=Date.parse('2026-09-29T17:00:00+09:00'),iso=new Date(boundary).toISOString(),calls=[];
const environments=[
 {id:'new',name:'アズヴォルト・レヴナント（9/29能力調整後～）',created_at:'2026-09-28',allow_match_input:true,match_input_start_at:iso,match_input_end_at:null},
 {id:'old',name:'アズヴォルト・レヴナント（2026/8/27～）',created_at:'2026-08-26',allow_match_input:true,match_input_start_at:null,match_input_end_at:iso}
];
const supabase={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
 rpc:async(name,args)=>{calls.push({name,args});return {error:null,data:name==='get_home_dashboard'?{summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]}:name.startsWith('get_analysis_aggregates_')?analysisFixture([],args):{version:1,totalMatches:0,groups:[]}};},
 from(table){const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>({data:{id:'admin'}}),then:(resolve,reject)=>Promise.resolve({data:table==='environments'?environments:[],error:null}).then(resolve,reject)};return q;}
};
const filename=require.resolve('../src/lib/supabase/server');require.cache[filename]={id:filename,filename,loaded:true,exports:{createSupabaseServerClient:async()=>supabase}};
const pages=[['home',require('../src/app/page').default],['analysis',require('../src/app/analysis/page').default],['matrix',require('../src/app/matrix/page').default]];
for(const delta of [-1,0,1])test(`actual three server pages select correct RPC environment at JST boundary ${delta}ms`,async t=>{
 t.mock.method(Date,'now',()=>boundary+delta);
 for(const [name,page]of pages)for(const explicit of [undefined,'old','new']){
  calls.length=0;const result=await page({searchParams:Promise.resolve({environment:explicit})});assert.ok(result);
  assert.equal(calls.length,1,name);assert.equal(calls[0].args.p_environment_id,explicit??(delta<0?'old':'new'),name);
 }
});
