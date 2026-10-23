/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {parseObsSet,obsOptions,selectedObsContents,obsCompositionUrl}=require('../src/lib/creator/obs-set');
const {uuid}=require('./creator-db.cjs');
test('seven content combinations preserve relative conditions and canonical ranks; reject invalid and empty configurations',()=>{
 for(let mask=1;mask<8;mask++){const v={name:' 配信 ',...obsOptions(),environment_id:mask&1?uuid(1):null,tier_work_id:mask&2?uuid(2):null,correlation_id:mask&4?uuid(3):null,environment_period:'7d',environment_ranks:['grandmaster:epic','master:ruby']};const parsed=parseObsSet(v);assert.equal(parsed.name,'配信');assert.equal(parsed.environment_period,'7d');assert.deepEqual(parsed.environment_ranks,['master:ruby','grandmaster:epic']);assert.equal(selectedObsContents(parsed).length,[1,2,4].filter(n=>mask&n).length);}
 const good={name:'x',...obsOptions(),environment_id:uuid(1),tier_work_id:null,correlation_id:null};
 for(const bad of [{environment_id:'bad'},{environment_id:null},{environment_period:'absolute-date'},{environment_period:null},{environment_ranks:[]},{environment_ranks:['bad']},{environment_ranks:null},{content_order:[]},{content_order:['environment','tier','tier']},{content_order:['environment','tier','bad']},{content_order:null},{display_mode:'cycle'},{display_mode:null}])assert.throws(()=>parseObsSet({...good,...bad}));
});
test('individual URLs preserve IDs, transparent flag and only known content; old clients keep old input shape',()=>{
 assert.equal(obsCompositionUrl(uuid(1)),`/admin/obs/composition/${uuid(1)}`);for(const content of ['environment','tier','correlation'])assert.equal(obsCompositionUrl(uuid(1),true,content),`/admin/obs/composition/${uuid(1)}?transparent=1&view=${content}`);
 assert.deepEqual(parseObsSet({name:'旧',tier_work_id:uuid(1),correlation_id:null}),{name:'旧',tier_work_id:uuid(1),correlation_id:null});
});
test('unified OBS exact scope and inventory; existing RPC, auth, PNG, old URLs and dependencies remain byte-identical',()=>{
 const s=require('./obs-unified-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');Object.keys(s.hashes).forEach(s.assertReviewed);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));for(const f of files)assert.equal(s.readBeforeUnified(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
