/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {selectInitialEnvironmentId:select}=require('../src/lib/environment-selection');
const boundary=Date.parse('2026-09-29T17:00:00+09:00');
const old={id:'old',name:'アズヴォルト・レヴナント（2026/8/27～）',created_at:'2026-08-26',allow_match_input:true,match_input_start_at:null,match_input_end_at:new Date(boundary).toISOString()};
const next={...old,id:'new',name:'アズヴォルト・レヴナント（9/29能力調整後～）',created_at:'2026-09-28',match_input_start_at:new Date(boundary).toISOString(),match_input_end_at:null};
for(const delta of [-1,0,1])test(`initial selection at 9/29 17:00 JST ${delta}ms; explicit history/future preserved`,()=>{
 assert.equal(select([next,old],undefined,boundary+delta),delta<0?'old':'new');
 for(const id of ['old','new'])assert.equal(select([next,old],id,boundary+delta),id);
});
test('multiple open environments use existing creation order/tie behavior without mutating input',()=>{
 const rows=[{...old,match_input_end_at:null},{...next,match_input_start_at:null},{...next,id:'tie',match_input_start_at:null}];
 const before=JSON.stringify(rows);assert.equal(select(rows,undefined,boundary),'new');assert.equal(JSON.stringify(rows),before);
 assert.equal(select([rows[2],rows[1],rows[0]],undefined,boundary),'tie');
});
test('manual stop, no open environments, empty environments and invalid query have safe defaults',()=>{
 assert.equal(select([{...next,allow_match_input:false},{...old,match_input_end_at:null}],undefined,boundary),'old');
 const closed=[{...old,allow_match_input:false},{...next,allow_match_input:false}];assert.equal(select(closed,undefined,boundary),'new');
 assert.equal(select([],undefined,boundary),'');assert.equal(select([],'missing',boundary),'');
 for(const id of ['',undefined,'missing'])assert.equal(select([next,old],id,boundary-1),'old');
 assert.equal(select([next],undefined,boundary-1),'new');
});
test('only three page selection expressions/imports change; all other existing production source and SQL unchanged',()=>{
 const base='57257f77fca4ec91c88c58f882342f49362d645c',git=a=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const pages=['src/app/page.tsx','src/app/analysis/page.tsx','src/app/matrix/page.tsx'];
 for(const p of git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(p=>/^(src|supabase)\//.test(p)||/^package(-lock)?\.json$/.test(p))){
  let expected=git(['show',base+':'+p]);
  if(pages.includes(p)){expected=expected.replace('  const selectedEnvironmentId = environments.some((environment) => environment.id === params.environment)\n    ? params.environment ?? ""\n    : getMostRecentlyCreatedId(environments);','  const selectedEnvironmentId = selectInitialEnvironmentId(environments, params.environment);').replace(', getMostRecentlyCreatedId','').replace('import { getMostRecentlyCreatedId } from "@/lib/utils";\n','');expected='import { selectInitialEnvironmentId } from "@/lib/environment-selection";\n'+expected;}
  if (!require('./rescue-scope.cjs').rescueSources.has(p)) assert.equal(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n'),expected,p);
 }
});
