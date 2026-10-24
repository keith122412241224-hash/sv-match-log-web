/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {EnvironmentData,TrendText,filterEnvironmentDeckRows:filter}=require('../src/components/environment/EnvironmentData');
const {buildEnvironmentViewV4,parseEnvironmentDashboardV4}=require('../src/lib/environment-dashboard-v4');
const {deckTrend}=require('../src/lib/environment-dashboard');
const f=require('./environment-deck-data-fixture.cjs'),args={p_environment_id:f.environments[0].id,p_period:'7d',p_rank_filters:['unranked']};
const data=()=>parseEnvironmentDashboardV4(f.dashboard(args),{environment:args.p_environment_id,period:'7d',ranks:['unranked']});
const defaults={className:'all',trend:'all',sort:'encounter',grouped:false};
test('environment deck UI preserves all other product code, aggregates, RPC, migrations and dependencies',()=>{
 const scope=require('./environment-deck-data-scope.cjs');scope.assertReviewed();
 const files=scope.git('ls-tree','-r','--name-only',scope.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)if(f!==scope.file)assert.equal(scope.read(f),scope.git('show',scope.base+':'+f),f);
 assert.deepEqual(scope.git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),files.filter(f=>/^(src|supabase)\//.test(f)).sort());
});
test('deck display combines every class/trend/sort without mutating aggregates and keeps unknown comparisons separate',()=>{
 const d=data(),original=structuredClone(d),rows=buildEnvironmentViewV4(d).rows.filter(r=>r.key!==f.id(242)),before=structuredClone(rows);
 for(const className of ['all',...f.classes.map(c=>c??'クラス未設定')])for(const trend of ['all','increase','decrease','flat'])for(const sort of ['encounter','win','delta','count']){
  const actual=filter(rows,{...defaults,className,trend,sort});
  const selected=rows.filter(r=>(className==='all'||(r.className??'クラス未設定')===className)&&(trend==='all'||r.trend.state===trend));
  assert.deepEqual(actual.map(r=>r.key).sort(),selected.map(r=>r.key).sort());
  const metric=r=>sort==='encounter'?r.encounterRate:sort==='win'?r.winRate:sort==='count'?r.current.winrate.evaluationCount:r.trend.delta===null?-Infinity:Math.abs(r.trend.delta);
  for(let i=1;i<actual.length;i++)assert(metric(actual[i-1])>=metric(actual[i]));
 }
 assert.deepEqual(rows,before);assert.deepEqual(d,original);
 assert.equal(filter([{...rows[0],className:'unknown-class'}],{...defaults,className:'クラス未設定'}).length,1);
 assert(filter(rows,{...defaults,sort:'delta'}).slice(-2).every(r=>r.trend.delta===null));
 assert(filter(rows,{...defaults,trend:'flat'}).every(r=>!['no_previous','no_current','no_comparison','insufficient'].includes(r.trend.state)));
 const tied=filter([rows[1],rows[4]],defaults);assert.deepEqual(filter([...tied].reverse(),defaults),tied);
});
test('display preserves exact +/-0.5pp trend thresholds, signed deltas, missing data and sample explanations',()=>{
 const d=data(),row=d.decks[0],total={status:'available',totalMatches:1000};
 for(const [current,previous,state]of [[15,10,'increase'],[10,15,'decrease'],[14,10,'flat']]){
  row.current.encounter.count=current;row.previous.encounter.count=previous;
  assert.equal(deckTrend(row,total,total).state,state);
 }
 assert.equal(deckTrend(row,{status:'available',totalMatches:29},total).state,'insufficient');
 const html=render(React.createElement(EnvironmentData,{data:data(),activeDeckIds:f.decks.filter(x=>x.is_active).map(x=>x.id)}));
 for(const s of ['+1.50ポイント','−1.50ポイント','−0.10ポイント','前期間の観測なし','今期の観測なし','サンプル不足','対象戦績数','1戦から2件','クラス未設定'])assert(html.includes(s),s);
 assert(!html.includes('無効なデッキ'));
 assert(!render(React.createElement(TrendText,{trend:{state:'no_comparison',current:null,previous:null,delta:null},detailed:true})).includes('ポイント'));
 const all=f.dashboard({...args,p_period:'all'});assert(buildEnvironmentViewV4(all).rows.every(r=>r.trend===null));
 for(const mode of ['empty','no-previous']){const x=f.dashboard(args,mode),rows=buildEnvironmentViewV4(x).rows;assert.equal(filter(rows,{...defaults,trend:'flat'}).length,0);}
});
