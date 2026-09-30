/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const {rescueSources,rankLoaders}=require('./rescue-scope.cjs');
const base='5534ace5efcf90a6725bef5a2e0cbb6e311d44ef';
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const declarations=s=>{const t=ts.createSourceFile('file.tsx',s,ts.ScriptTarget.Latest,true);return new Map(t.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>[n.name?.text??n.declarationList?.declarations[0]?.name?.text??n.getText(t),n.getText(t)]));};
test('rescue preserves all current main source outside the explicit display/guest allowlist; every existing SQL and dependencies unchanged',()=>{
 for(const p of git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(p=>/^(src|supabase)\//.test(p)||/^package(-lock)?\.json$/.test(p))){
  if(!rescueSources.has(p))assert.equal(p === 'src/app/analysis/page.tsx' ? require('./analysis-split-scope.cjs').analysisBeforeSplit() : read(p),git(['show',base+':'+p]),p);
 }
 const before=declarations(git(['show',base+':src/lib/data.ts'])),after=declarations(read('src/lib/data.ts'));
 for(const [name,value]of before)if(!rankLoaders.includes(name))assert.equal(after.get(name),value,name);
 assert.deepEqual([...after.keys()].filter(k=>!before.has(k)),['attachHomeRecentRanks']);
 assert.equal(after.get('getHomeDashboard').replace('return await attachHomeRecentRanks(supabase, data);','return data;'),before.get('getHomeDashboard'));
 assert.equal(after.get('getRecentMatchesWithRelations').replace('turn_order,rank_tier,master_group,grandmaster_rating,environment:','turn_order,environment:'),before.get('getRecentMatchesWithRelations'));
 for(const page of ['src/app/page.tsx','src/app/matrix/page.tsx']){
  assert.match(read(page),/selectInitialEnvironmentId\(environments, params.environment\)/);
  assert.doesNotMatch(read(page),/getMatches\(/);
 }
 const a=read('src/app/actions.ts');assert.equal(a,git(['show',base+':src/app/actions.ts']));
});
test('E audit adds a catalog-only SELECT, separate from migrations, without mutation or execution statements',()=>{
 const sql=read('supabase/checks/staging_schema_audit.sql').replace(/--[^\n]*/g,'');
 assert.match(sql,/^\s*with\b/i);
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|do|call|copy|set_config|dblink|pg_read_file)\b/i);
 assert.doesNotMatch(sql,/\bfrom\s+public\./i);
 assert.equal((sql.match(/;/g)||[]).length,1);
 assert.ok(!fs.existsSync('supabase/staging/prepare_rank_testing.sql'));
 assert.ok(!fs.existsSync('docs/staging-setup.md'));
});
