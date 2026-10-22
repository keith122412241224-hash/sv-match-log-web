/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
let user={id:'member',is_anonymous:false},calls=[],error=null,archetypes=[],data={version:1,totalMatches:1,groups:[{myDeckId:'a',opponentDeckId:'b',total:1,wins:1}]};
const env='00000000-0000-4000-8000-000000000100';
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
mock('../src/lib/data',{getCurrentUser:async()=>user,getEnvironments:async()=>[{id:env,name:'環境',user_id:'private-owner',created_at:'2026-01-01'}],getDecks:async()=>[],getActiveArchetypes:async()=>archetypes});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data,error};}})});
mock('../src/components/AppShell',{AppShell:({children})=>React.createElement('main',null,children)});
mock('next/navigation',{useRouter:()=>({push(){}})});
const {getMemberMatchupAggregates}=require('../src/lib/matchup-data');
const Page=require('../src/app/matrix/page').default;

test('member matrix loader rejects unsigned/Guest/missing/string claims before any RPC, even editable false metadata',async()=>{
  for(user of [null,{id:'guest',is_anonymous:true},{id:'guest'},{id:'guest',is_anonymous:'false'},{id:'guest',is_anonymous:true,user_metadata:{is_anonymous:false}}]){
    calls=[];await assert.rejects(()=>getMemberMatchupAggregates(env,['a']));assert.deepEqual(calls,[]);
  }
});
test('member matrix loader normalizes ranks and never falls back on RPC failures or malformed aggregates',async()=>{
  user={id:'member',is_anonymous:false};calls=[];
  assert.equal((await getMemberMatchupAggregates(env,['aa','a','a'])).totalMatches,1);
  assert.deepEqual(calls,[{name:'get_member_matchup_aggregates_v1',args:{p_environment_id:env,p_rank_filters:['a','aa']}}]);
  for(error of [{code:'42501'},{code:'22023'},{code:'PGRST202'}]){calls=[];await assert.rejects(()=>getMemberMatchupAggregates(env,['a']));assert.equal(calls.length,1);}
  error=null;
  for(data of [null,{version:1,totalMatches:1,groups:[]},{version:1,totalMatches:1,groups:[{myDeckId:'a',opponentDeckId:'b',total:1,wins:2}]}])await assert.rejects(()=>getMemberMatchupAggregates(env,['a']));
  for(const ranks of [[],['bad'],[null],['master'],Array(18).fill('a')]){calls=[];await assert.rejects(()=>getMemberMatchupAggregates(env,ranks));assert.deepEqual(calls,[]);}
  for(const invalid of ['', 'bad']){calls=[];await assert.rejects(()=>getMemberMatchupAggregates(invalid,['a']));assert.deepEqual(calls,[]);}
});
test('member page defaults to mine, exposes all-users to members only and guards forged scope URL',async()=>{
  data={version:1,totalMatches:0,groups:[]};error=null;
  for(user of [{id:'member',is_anonymous:false},{id:'admin',is_anonymous:false},{id:'guest',is_anonymous:true},{id:'guest'},null]){
    for(const scope of [undefined,'mine','all']){
      calls=[];const html=render(await Page({searchParams:Promise.resolve({environment:env,scope})}));
      assert.equal(html.includes('name="scope"'),user?.is_anonymous===false);
      if(scope==='all'&&user?.is_anonymous===false){assert.equal(calls.length,1);assert.equal(calls[0].name,'get_member_matchup_aggregates_v1');assert.match(html,/SV Match Logに登録された全ユーザーの戦績を集計しています。/);}
      else {assert.ok(calls.every(c=>c.name!=='get_member_matchup_aggregates_v1'&&c.args.p_include_all_users===false));assert.match(html,/自分が登録した戦績だけ/);}
    }
  }
});
test('matrix serializes only display metadata to client components, never owner IDs or unused fields',async()=>{
  user={id:'member',is_anonymous:false};archetypes=[{id:'a',name:'A',class_name:'エルフ',user_id:'private-owner',created_at:'private-date',memo:'private-memo'}];
  const tree=await Page({searchParams:Promise.resolve({scope:'all'})});
  const find=(node,name)=>!node||typeof node!=='object'?undefined:Array.isArray(node)?node.map(n=>find(n,name)).find(Boolean):node.type?.name===name?node:find(node.props?.children,name);
  assert.deepEqual(find(tree,'MatrixFilters').props.environments,[{id:env,name:'環境'}]);
  const props=find(tree,'MatchupMatrix').props;
  assert.deepEqual(props.opponentDecks,[{id:'a',name:'A',class_name:'エルフ'}]);
  assert.deepEqual(props.rows[0].myDeck,props.opponentDecks[0]);
  assert.doesNotMatch(JSON.stringify(props),/private-owner|private-date|private-memo|user_id/);archetypes=[];
});
test('member matrix scope preserves all existing SQL/auth/analysis/renderer/dependencies byte-for-byte',()=>{
  const cp=require('node:child_process'),{createHash}=require('node:crypto');
  const s=require('./member-matrix-scope.cjs');
  const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
  const files=git(['ls-tree','-r','--name-only',s.base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
  for(const file of files)assert.equal(s.readBeforeMemberMatrix(file),git(['show',s.base+':'+file]),file);
  assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
  for(const [file,hash]of Object.entries(s.hashes))assert.equal(createHash('sha256').update(require('./matrix-mobile-png-share-scope.cjs').readBeforeMatrixPng(file)).digest('hex'),hash,file);
});
