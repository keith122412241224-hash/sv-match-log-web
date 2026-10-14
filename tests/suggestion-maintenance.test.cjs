/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),Module=require('node:module');
let role='admin',reads=0;
const original=Module._load;
Module._load=function(name,...args){
 if(name==='@/lib/supabase/server')return{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:role==='guest'?null:{id:'fixture'}}})},from(table){assert.equal(table,'admin_users','no business table access allowed');reads++;return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:role==='admin'?{id:'admin'}:null})};},rpc(){assert.fail('no RPC allowed');}})};
 if(name==='next/navigation')return{redirect(url){throw Object.assign(Error('redirect'),{url});}};
 if(name==='next/cache')return{revalidatePath(){assert.fail('no write invalidation allowed');}};
 return original.call(this,name,...args);
};
const actions=require('../src/app/admin/actions');Module._load=original;
test('maintenance blocks both direct actions and every requested state even with RPC mode set',async()=>{
 const old=process.env.ADMIN_SUGGESTION_WRITES;role='admin';reads=0;
 try{for(const mode of [undefined,'paused','rpc']){if(mode===undefined)delete process.env.ADMIN_SUGGESTION_WRITES;else process.env.ADMIN_SUGGESTION_WRITES=mode;
  for(const name of ['approveSuggestionAsArchetype','updateSuggestionStatus'])for(const status of ['approved','pending','rejected','invalid','']){
   const form=new FormData();for(const[k,v]of Object.entries({id:'candidate',suggestion_id:'candidate',name:'deck',class_name:'エルフ',status}))form.set(k,v);
   await assert.rejects(actions[name](form),e=>e.url==='/admin?section=decks&deckSection=suggestions&notice=suggestion_paused');
  }
 }assert.equal(reads,30);}finally{if(old===undefined)delete process.env.ADMIN_SUGGESTION_WRITES;else process.env.ADMIN_SUGGESTION_WRITES=old;}
});
test('maintenance actions still require a signed-in administrator',async()=>{
 for(const r of ['guest','member']){role=r;for(const name of ['approveSuggestionAsArchetype','updateSuggestionStatus'])await assert.rejects(actions[name](new FormData()),e=>e.url===(r==='guest'?'/login':'/'));}role='admin';
});
test('Stage A changes only two product files and two action bodies, with no migration or RPC implementation',()=>{
 const {base,hashes,readBeforeSuggestionMaintenance}=require('./suggestion-maintenance-scope.cjs');
 assert.deepEqual(Object.keys(hashes).sort(),['src/app/admin/actions.ts','src/components/admin/SuggestionsPanel.tsx']);
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeSuggestionMaintenance(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),files.filter(f=>/^(src|supabase)\//.test(f)).sort());
 const ts=require('typescript'),parse=s=>ts.createSourceFile('actions.ts',s,ts.ScriptTarget.Latest,true),before=parse(git(['show',base+':src/app/admin/actions.ts'])),after=parse(fs.readFileSync('src/app/admin/actions.ts','utf8'));
 const keep=s=>s.statements.filter(n=>!(ts.isFunctionDeclaration(n)&&['approveSuggestionAsArchetype','updateSuggestionStatus'].includes(n.name.text))&&!(ts.isImportDeclaration(n)&&n.importClause?.isTypeOnly&&n.moduleSpecifier.text==='@/types/database')).map(n=>n.getText());
 assert.deepEqual(keep(after),keep(before));
 for(const node of after.statements.filter(n=>ts.isFunctionDeclaration(n)&&['approveSuggestionAsArchetype','updateSuggestionStatus'].includes(n.name.text)))assert.doesNotMatch(node.getText(),/\.from\(|\.rpc\(|process\.env|\.insert\(|\.update\(/);
});
