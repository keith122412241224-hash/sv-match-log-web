/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const scope=require('./environment-trends-copy-scope.cjs');
test('trend copy removal is limited to three paragraphs and their unused formatter; chart, fetch, calculations and all other product files stay exact',()=>{
  scope.readBeforeTrendCopy(scope.file);
  const names=cp.execFileSync('git',['diff',scope.base,'--name-only','--','src','supabase','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n');
  assert.deepEqual(names,[scope.file]);
  assert.equal(cp.execFileSync('git',['ls-files','--others','--exclude-standard','--','src','supabase'],{encoding:'utf8'}).trim(),'');
});
test('both metrics retain the complete rendered controls/chart/details across empty, loading, error and varying successful cutoffs',()=>{
  const filename=path.resolve(scope.file),catalog=[{id:'deck-a',name:'テストデッキ',class_name:'エルフ'}],selection={environment:'environment',period:'7d',ranks:['unranked']};
  let states;
  function compile(source){const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;const inherited=m.require.bind(m);m.require=name=>name==='react'?{...React,useState:()=>[states.shift(),()=>{}],useEffect:()=>{},useMemo:fn=>fn()}:inherited(name);m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports.EnvironmentTrends;}
  const before=compile(scope.original()),after=compile(fs.readFileSync(filename,'utf8'));
  const key=JSON.stringify({...selection,decks:['deck-a']});
  // Removing siblings changes useId's generated values, while references must stay paired.
  const normalizeIds=html=>{const ids=new Map();return html.replace(/_R_[a-zA-Z0-9]+_/g,id=>{if(!ids.has(id))ids.set(id,'generated-'+ids.size);return ids.get(id);});};
  for(const metric of ['encounter','winrate'])for(const mode of ['empty','loading','error','success'])for(const cutoff of ['2026-11-16T11:00:00Z','2030-12-31T14:00:00Z']){
    const date=cutoff.slice(0,10),data={version:1,environmentId:selection.environment,period:'7d',rankFilters:selection.ranks,aggregatedAt:cutoff,dataThrough:cutoff,decks:[{id:'deck-a',name:'テストデッキ',className:'エルフ',points:[{date,total:25,encounters:5,registrations:5,evaluations:6,wins:3}]}]};
    const result=mode==='success'?{key,data,failed:false}:mode==='error'?{key,data:null,failed:true}:null;
    function html(component){states=[mode==='empty'?[]:['deck-a'],metric,result,0];return render(component({selection,catalog,active:true}));}
    const old=html(before),current=html(after);
    const expected=old.replace(/<p class="text-xs leading-relaxed text-muted">各日付[\s\S]*?<\/p>/,'').replace(/<p class="text-xs text-muted">対象登録戦績10件未満[\s\S]*?<\/p>/,'').replace(/<p class="text-xs text-muted">集計対象：[\s\S]*?<\/p>/,'');
    assert.equal(normalizeIds(current),normalizeIds(expected));
    assert.doesNotMatch(current,/各日付を含む|環境開始前は|当日は集計対象|観測がない箇所|両プレイヤーの視点|ミラー対戦は|対象登録戦績10件未満|日付ごとの詳細で件数|集計対象：/);
    if(mode==='success'){assert.match(current,/詳細を見る日付/);assert.match(current,/data-trend-deck="deck-a"/);if(metric==='winrate')assert.match(current,/サンプル不足/,'detail sample labels remain');}
  }
});
