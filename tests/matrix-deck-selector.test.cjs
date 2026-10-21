/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {MatchupMatrix}=require('../src/components/MatchupMatrix'),{SHADOWVERSE_CLASSES}=require('../src/lib/constants'),{buildWinRateMatrix}=require('../src/lib/analytics');
const file='src/components/MatchupMatrix.tsx',base='e8068a2a9baa6b9c2d1975eec37686ef7b511a8a';
const old=cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'),current=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const baseline=new Module(path.resolve(file),module);baseline.filename=path.resolve(file);baseline.paths=module.paths;baseline._compile(ts.transpileModule(old,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,baseline.filename);
const decks=[{id:'witch2',name:'ウィッチ後発',class_name:'ウィッチ'},{id:'elf',name:'長い名前'.repeat(30),class_name:'エルフ'},{id:'witch1',name:'ウィッチ先発',class_name:'ウィッチ'},{id:'unknown',name:'新クラスのデッキ',class_name:'未定義クラス'},{id:'blank',name:'クラス未設定',class_name:''},{id:'royal',name:'ロイヤルデッキ',class_name:'ロイヤル'}];
const props={rows:buildWinRateMatrix(Array.from({length:8},(_,i)=>({my_deck_id:'witch2',opponent_deck_id:'elf',result:i<5?'win':'lose'})),decks,decks),opponentDecks:decks,createdAtLabel:'2026/10/21'};

test('normal and Guest selectors start collapsed with accurate totals, unique groups and input deck order within each class',()=>{
 for(const title of ['対面勝率表','ゲスト対面勝率表']){
  const html=render(React.createElement(MatchupMatrix,{...props,title}));
  const selector=html.slice(html.indexOf('<section aria-label="表示するデッキ"'),html.indexOf('<div class="flex flex-wrap items-center justify-between gap-3">'));
  assert.match(selector,/6 \/ 6デッキを表示中/);assert.doesNotMatch(selector,/aria-expanded="true"/);assert.equal((selector.match(/aria-expanded="false"/g)||[]).length,5);
  const groups=[...selector.matchAll(/<section aria-label="([^"]+)のデッキ"/g)].map(m=>m[1]);assert.deepEqual(groups,[...SHADOWVERSE_CLASSES.filter(c=>['エルフ','ロイヤル','ウィッチ'].includes(c)),'その他']);
  const buttons=[...selector.matchAll(/<button aria-pressed="true"[\s\S]*?<span class="min-w-0 break-words \[overflow-wrap:anywhere\]">([^<]*)<\/span>/g)].map(m=>m[1]);
  assert.deepEqual(buttons,[decks[1].name,decks[5].name,decks[0].name,decks[2].name,decks[3].name,decks[4].name]);assert.equal(new Set(buttons).size,decks.length);
  assert.match(selector,/ウィッチ<span[^>]*>（2 \/ 2）/);assert.match(selector,/その他<span[^>]*>（2 \/ 2）/);
  const ids=[...selector.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]),controls=[...selector.matchAll(/aria-controls="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(controls,ids);assert.equal(new Set(ids).size,ids.length);
 }
});

test('selector changes leave the entire rendered matrix, legend, PNG button and export implementation identical to Production',()=>{
 for(const title of ['対面勝率表','ゲスト対面勝率表']){
  const after=render(React.createElement(MatchupMatrix,{...props,title})),before=render(React.createElement(baseline.exports.MatchupMatrix,{...props,title})),start='<div class="flex flex-wrap items-center justify-between gap-3">';
  assert.ok(after.includes(start)&&before.includes(start));assert.equal(after.slice(after.indexOf(start)),before.slice(before.indexOf(start)));
  assert.match(after,/62\.5%/);assert.match(after,/5勝 \/ 8戦/);assert.doesNotMatch(after,/指数|参考値/);
 }
 const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))).trim();
 assert.equal(slice(current,'  useEffect(() => {','  function toggleDeck'),slice(old,'  useEffect(() => {','  function toggleDeck'),'selection reconciliation and row/column filtering are unchanged');
 assert.equal(slice(current,'  async function saveImage() {','  return ('),slice(old,'  async function saveImage() {','  return ('),'PNG function untouched');
});

test('empty decks have no empty class groups, accurate zero summary and the existing empty-selection guidance',()=>{
 const html=render(React.createElement(MatchupMatrix,{rows:[],opponentDecks:[],createdAtLabel:'2026/10/21'}));
 assert.match(html,/0 \/ 0デッキを表示中/);assert.doesNotMatch(html,/のデッキ"/);assert.match(html,/表示するデッキが選択されていません。/);assert.match(html,/disabled=""/);
});
