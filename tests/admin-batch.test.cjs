/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const {batchResult,batchSummary,readBatchValues,sameBatchValues}=require('../src/lib/admin-batch');
const {runAdminBatch}=require('../src/lib/admin-batch-server');
const id='00000000-0000-4000-8000-000000000001';
function form(kind='archetype'){const f=new FormData();f.set(kind+'_ids',id);f.set('name_'+id,'name');f.set('class_name_'+id,'エルフ');f.set('sort_order_'+id,'2');return f;}
test('batch validation rejects blank names, bad class/order/calendar and invalid windows without coercion',()=>{
 for(const[key,values]of [['name',['',' ']],['class_name',['bad','']],['sort_order',['','1.2','NaN','2147483648','1e2']]])for(const v of values){const f=form();f.set(key+'_'+id,v);assert.throws(()=>readBatchValues('archetype',f,id));}
 for(const[key,value]of [['start_date','2026-02-30'],['match_input_start_at','invalid'],['dashboard_end_at','2026-02-30T10:00']]){const f=form('environment');f.set(key+'_'+id,value);assert.throws(()=>readBatchValues('environment',f,id));}
 const f=form('environment');f.set('match_input_start_at_'+id,'2026-10-01T10:00');f.set('match_input_end_at_'+id,'2026-10-01T09:00');assert.throws(()=>readBatchValues('environment',f,id));
});
test('batch preserves JST milliseconds, nulls, omitted legacy cutoff and unchecked flags',()=>{
 const f=form('environment');f.set('match_input_start_at_'+id,'2026-10-01T10:00:00.123');let v=readBatchValues('environment',f,id);assert.equal(v.match_input_start_at,'2026-10-01T01:00:00.123Z');assert.equal(v.allow_match_input,false);assert.equal(v.start_date,null);assert(!Object.hasOwn(v,'dashboard_end_at'));f.set('dashboard_end_at_'+id,'');v=readBatchValues('environment',f,id);assert.equal(v.dashboard_end_at,null);
});
test('batch comparison normalizes timezones without discarding PostgreSQL microseconds',()=>{
 assert(sameBatchValues({x_at:'2026-01-01T09:00:00.123456+09:00'},{x_at:'2026-01-01T00:00:00.123456Z'}));
 assert(!sameBatchValues({x_at:'2026-01-01T00:00:00.123457Z'},{x_at:'2026-01-01T00:00:00.123456Z'}));
});
test('batch summaries distinguish partial/unknown/zero and never count unknown as failed',()=>{
 const rows=['success','database','validation','unknown'].map((status,i)=>({id:String(i),label:'row',status,message:'safe'}));const r=batchResult('environment',rows);assert.deepEqual([r.total,r.succeeded,r.failed,r.unknown],[4,1,2,1]);assert.match(batchSummary(r,'environment'),/4件中1件/);assert.match(batchSummary(r,'environment'),/1件は保存結果/);assert.notEqual(batchResult('environment',[]).notice,'environments_updated');
});
test('malformed/duplicate batch IDs never reach a database; blank rows are explicit errors',async()=>{
 const db={from(){throw Error('must not query');}};const f=form();f.append('archetype_ids',id);let r=await runAdminBatch(db,'archetype',f);assert.equal(r.total,1);assert.equal(r.rows[0].status,'validation');f.delete('archetype_ids');f.append('archetype_ids','bad');r=await runAdminBatch(db,'archetype',f);assert.equal(r.rows[0].status,'validation');const empty=await runAdminBatch(db,'environment',new FormData());assert.equal(empty.succeeded,0);
});
test('QA2-009 scope pins Phase 1 only and preserves other actions, SQL, dependencies and product files',()=>{
 const {base,hashes,added,readBeforeAdminBatch}=require('./admin-batch-scope.cjs');
 const expected=['src/app/admin/actions.ts','src/app/admin/page.tsx','src/app/admin/environments/route.ts','src/components/admin/AdminEnvironmentTable.tsx','src/components/admin/AdminArchetypeTable.tsx',...added];
 assert.deepEqual(Object.keys(hashes).sort(),expected.sort());
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(require('./suggestion-maintenance-scope.cjs').readBeforeSuggestionMaintenance(file)).digest('hex'),hash,file);
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeAdminBatch(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
 const ts=require('typescript'),functions=s=>Object.fromEntries(ts.createSourceFile('actions.ts',s,ts.ScriptTarget.Latest,true).statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>[n.name.text,n.getText()]));
 const before=functions(git(['show',base+':src/app/admin/actions.ts'])),after=functions(require('./suggestion-maintenance-scope.cjs').readBeforeSuggestionMaintenance('src/app/admin/actions.ts'));
 for(const[name,code]of Object.entries(before))if(!['updateEnvironmentsBatch','updateArchetypesBatch'].includes(name))assert.equal(after[name],code,name+' remains unchanged');
});
