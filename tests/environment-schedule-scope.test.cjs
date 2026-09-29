/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),cp=require('child_process'),ts=require('typescript');
const base='1181db5c3b655dfd2ee2e87009aad74069c23185';
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const changed=new Set([...require('./rescue-scope.cjs').rescueSources,"src/app/page.tsx","src/app/analysis/page.tsx","src/app/matrix/page.tsx",'src/app/actions.ts','src/app/admin/actions.ts','src/app/admin/page.tsx','src/app/guest/page.tsx','src/app/matches/page.tsx','src/components/admin/AdminEnvironmentTable.tsx','src/components/admin/CreateEnvironmentForm.tsx','src/lib/data.ts','src/types/database.ts']);
test('scheduling preserves all existing aggregation, rank, UX, guest identity, baseline and legacy source',()=>{
 for(const p of git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(p=>/^(src|supabase)\//.test(p)||/^package(-lock)?\.json$/.test(p))){
  if(!changed.has(p))assert.equal(read(p),git(['show',base+':'+p]),p);
 }
 const declarations=source=>{
  const tree=ts.createSourceFile('file.ts',source,ts.ScriptTarget.Latest,true),result=new Map();
  for(const node of tree.statements){const name=node.name?.text??(ts.isVariableStatement(node)?node.declarationList.declarations[0].name.text:null);if(name)result.set(name,node.getText(tree));}return result;
 };
 for(const [file,allowed]of [['src/lib/data.ts',['getInputEnabledEnvironments', ...require('./rescue-scope.cjs').rankLoaders]],['src/app/actions.ts',['saveMatchFromForm','importGuestMatches','isEnvironmentInputEnabled']]]){
  const current=declarations(read(file)),old=declarations(git(['show',base+':'+file]));
  for(const [name,text]of old)if(!allowed.includes(name))assert.equal(current.get(name),text,file+':'+name);
 }
 const sql=read('supabase/migrations/20260928060000_environment_match_input_schedule.sql').replace(/--[^\n]*/g,'');
 assert.doesNotMatch(sql,/\b(policy|index|cron|security\s+definer|update\s+public\.)\b/i);
 assert.match(sql,/before insert on public.matches/i);
});
