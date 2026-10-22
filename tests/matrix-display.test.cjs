/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {MatchupMatrix}=require('../src/components/MatchupMatrix');
const {buildWinRateMatrix}=require('../src/lib/analytics');
const base='81bae05e496c5abfcdd5c5614142c9acce3e9105',file='src/components/MatchupMatrix.tsx';
const source=cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'});
const baseline=new Module(path.resolve(file),module);baseline.filename=path.resolve(file);baseline.paths=module.paths;
baseline._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,baseline.filename);

test('normal and browser Guest matrices remove only index/reference labels and reduce cell height; all rates, counts, colors and empty cells match Production',()=>{
 const decks=['A','B','C','D','E','F'].map(id=>({id,name:id==='A'?'とても長いデッキ名'.repeat(4):id,class_name:'エルフ'}));
 const counts=[[8,5],[4,2],[1,0],[20,9],[5,2]];
 const matches=counts.flatMap(([total,wins],j)=>Array.from({length:total},(_,i)=>({my_deck_id:'A',opponent_deck_id:decks[j].id,result:i<wins?'win':'lose'})));
 const rows=buildWinRateMatrix(matches,decks,decks);
 assert.equal(rows[0].cells[0].winRate,62.5);assert.equal(rows[0].cells[1].isLowSample,true);assert.ok(Number.isFinite(rows[0].cells[0].environmentIndex));
 for(const title of ['対面勝率表','ゲスト対面勝率表']){
  const props={rows,opponentDecks:decks,title,environmentName:'検証環境',createdAtLabel:'2026/10/21'};
  const before=render(React.createElement(baseline.exports.MatchupMatrix,props)),after=render(React.createElement(MatchupMatrix,props));
  assert.match(before,/指数/);assert.match(before,/参考値/);assert.doesNotMatch(after,/指数|参考値/);
  assert.match(after,/62\.5%/);assert.match(after,/5勝 \/ 8戦/);assert.match(after,/未対戦/);
  const expected=before.replace(' / 参考値: 4戦以下','').replaceAll('h-24 min-w-32','h-16 min-w-32')
   .replace(/<span class="text-\[11px\] font-bold">参考値<\/span>/g,'').replace(/<span class="text-\[11px\]">指数 [^<]*<\/span>/g,'');
  // The deck selector has its own interaction tests; keep the entire legend/export/matrix exact.
  const matrixStart='<div class="flex flex-wrap items-center justify-between gap-3">';
  assert.ok(after.includes(matrixStart)&&expected.includes(matrixStart));
  assert.equal(after.slice(after.indexOf(matrixStart)),expected.slice(expected.indexOf(matrixStart)),'complete matrix/export render parity outside the requested display changes');
 }
});

test('matrix display change leaves every other product file, SQL, migration and dependency unchanged',()=>{
 const ux=require('./analysis-ux-scope.cjs');
 const independent=require('./creator-independent-scope.cjs');
 const changed=cp.execFileSync('git',['diff',base,'--name-only','--','src','supabase','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const f of changed.filter(f=>f!==file)){
  if(Object.hasOwn(independent.hashes,f)){independent.assertReviewed(f);if(!independent.added.has(f))assert.equal(independent.readBeforeIndependent(f),cp.execFileSync('git',['show',base+':'+f],{encoding:'utf8'}).replaceAll('\r\n','\n'));continue;}
  ux.assertReviewed(f);
  if(ux.added.has(f))assert.equal(cp.execFileSync('git',['ls-tree','--name-only',base,'--',f],{encoding:'utf8'}).trim(),'','reviewed added file must not exist in the historical baseline');
  else assert.equal(ux.readBeforeAnalysisUx(f),cp.execFileSync('git',['show',base+':'+f],{encoding:'utf8'}).replaceAll('\r\n','\n'));
 }
 assert.deepEqual(changed.filter(f=>!Object.hasOwn(ux.hashes,f)&&!Object.hasOwn(independent.hashes,f)),[file]);
 const untracked=cp.execFileSync('git',['ls-files','--others','--exclude-standard','--','src','supabase'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);for(const f of untracked){assert.ok(ux.added.has(f));ux.assertReviewed(f);}
});
