/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),{createHash}=require('node:crypto');
test('Phase 2 only changes candidate actions/UI, private receipt migration; Phase 1 and all unrelated product stay byte-identical',()=>{
 const {base,hashes,added,readBeforeSuggestionApproval}=require('./suggestion-approval-scope.cjs');
 const expected=['src/app/admin/actions.ts','src/app/admin/page.tsx','src/components/admin/SuggestionsPanel.tsx',...added];assert.deepEqual(Object.keys(hashes).sort(),expected.filter(f=>!require('./member-matrix-scope.cjs').added.has(f)).sort());
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex'),hash,file);
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeSuggestionApproval(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
 const ts=require('typescript'),functions=s=>Object.fromEntries(ts.createSourceFile('actions.ts',s,ts.ScriptTarget.Latest,true).statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>[n.name.text,n.getText()]));
 const before=functions(git(['show',base+':src/app/admin/actions.ts'])),after=functions(fs.readFileSync('src/app/admin/actions.ts','utf8').replaceAll('\r\n','\n'));
 for(const[name,code]of Object.entries(before))if(!['approveSuggestionAsArchetype','updateSuggestionStatus'].includes(name))assert.equal(after[name],code,name);
 for(const name of ['approveSuggestionAsArchetype','updateSuggestionStatus']){assert.match(after[name],/requireAdminClient/);assert.match(after[name],/decideSuggestion/);assert.doesNotMatch(after[name],/\.insert\(|\.update\(/);}
});
