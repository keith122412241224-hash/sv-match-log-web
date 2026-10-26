/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectAnalysisMatchups}=require('../src/lib/analysis-matchups');
const {buildAnalysisFromAggregates}=require('../src/lib/analysis-aggregates');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const decks=['a','b','c','empty'].map(id=>({id,name:'同名デッキ',class_name:'エルフ'}));
const records=[];
for(const [my,opponent,total,wins] of [['a','b',8,2],['a','c',5,4],['a','a',2,1],['b','c',4,4]])for(let i=0;i<total;i++)records.push({id:String(records.length),my_deck_id:my,opponent_deck_id:opponent,my_archetype_id:my,opponent_archetype_id:opponent,result:i<wins?'win':'lose',turn_order:'first',played_at:'2026-10-20T00:00:00Z'});
test('matchup presentation keeps IDs, counts, wins, rates and low-sample flags in direct and reversed modes',()=>{
 for(const combined of [false,true]){
  const aggregate=analysisFixture(records,{p_include_reversed:combined,p_use_archetype:true});
  const model=buildAnalysisFromAggregates(aggregate,decks,decks),before=structuredClone(model);
  const groups=selectAnalysisMatchups(model.matrix,'count',0);
  assert.ok(groups.every(g=>g.myDeck.id!=='empty'));
  assert.equal(groups.reduce((n,g)=>n+g.total,0),combined?38:19);
  for(const group of groups)for(const cell of group.cells){
   const views=records.flatMap(r=>[{my:r.my_deck_id,opp:r.opponent_deck_id,win:r.result==='win'},...(combined?[{my:r.opponent_deck_id,opp:r.my_deck_id,win:r.result!=='win'}]:[])]).filter(r=>r.my===group.myDeck.id&&r.opp===cell.opponentDeckId);
   assert.equal(cell.total,views.length);assert.equal(cell.wins,views.filter(r=>r.win).length);
   assert.strictEqual(cell,model.matrix.find(r=>r.myDeck.id===group.myDeck.id).cells.find(c=>c.opponentDeckId===cell.opponentDeckId));
  }
  assert.deepEqual(model,before);
 }
});
test('per-matchup count filter, three orders, single selection, empty states and immutable inputs',()=>{
 const {matrix}=buildAnalysisFromAggregates(analysisFixture(records,{p_use_archetype:true}),decks,decks);
 matrix.forEach(row=>{row.cells.forEach(Object.freeze);Object.freeze(row.cells);Object.freeze(row);});Object.freeze(matrix);
 const ids=(sort,min=0)=>selectAnalysisMatchups(matrix,sort,min,'a')[0].cells.map(c=>c.opponentDeckId);
 assert.deepEqual(ids('count'),['b','c','a']);assert.deepEqual(ids('win-desc'),['c','a','b']);assert.deepEqual(ids('win-asc'),['b','a','c']);assert.deepEqual(ids('count',5),['b','c']);
 assert.equal(selectAnalysisMatchups(matrix,'count',5,'a')[0].total,15,'heading total is not reduced by matchup filter');
 assert.equal(selectAnalysisMatchups(matrix,'count',5,'b')[0].cells.length,0,'4-match opponent is excluded even with other decks present');
 assert.deepEqual(selectAnalysisMatchups(matrix,'count',0,'empty'),[]);assert.deepEqual(selectAnalysisMatchups([],'count',0),[]);
});
test('arbitrary minimum includes exact boundaries per matchup without changing group totals or aggregates in either mode',()=>{
 for(const minimum of [1,3,5,10,30])for(const combined of [false,true]){
  const samples=[minimum-1,minimum,minimum+1].flatMap((count,index)=>Array.from({length:count},(_,i)=>({id:String(index)+'-'+String(i),my_deck_id:'a',opponent_deck_id:decks[index+1].id,my_archetype_id:'a',opponent_archetype_id:decks[index+1].id,result:i%2?'lose':'win',turn_order:'first',played_at:'2026-10-20T00:00:00Z'})));
  const model=buildAnalysisFromAggregates(analysisFixture(samples,{p_include_reversed:combined,p_use_archetype:true}),decks,decks),before=structuredClone(model);
  const all=selectAnalysisMatchups(model.matrix,'count',0);
  for(const sort of ['count','win-desc','win-asc']){
   const groups=selectAnalysisMatchups(model.matrix,sort,minimum);
   for(const group of groups){
    const original=all.find(g=>g.myDeck.id===group.myDeck.id);
    assert.equal(group.total,original.total);
    assert.deepEqual([...group.cells].map(c=>c.opponentDeckId).sort(),original.cells.filter(c=>c.total>=minimum).map(c=>c.opponentDeckId).sort());
    group.cells.forEach(cell=>assert.strictEqual(cell,original.cells.find(c=>c.opponentDeckId===cell.opponentDeckId)));
   }
   assert.ok(groups.some(g=>g.cells.some(c=>c.total===minimum)),'exact boundary included');
   assert.ok(groups.every(g=>g.cells.every(c=>c.total>=minimum)),'below threshold excluded');
  }
  assert.deepEqual(model,before);
 }
});
test('matchup change is limited to reviewed presentation/export files; aggregates, APIs and all other product files are unchanged',()=>{
 const cp=require('node:child_process'),scope=require('./analysis-matchups-scope.cjs');
 Object.keys(scope.hashes).forEach(scope.assertReviewed);
 const changed=cp.execFileSync('git',['diff','--name-only',scope.base,'--','src','supabase','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 assert.deepEqual(require('./security-audit-scope.cjs').excludeReviewedSecurityChanges(changed).filter(f=>!scope.added.has(f)).sort(),Object.keys(scope.hashes).filter(f=>!scope.added.has(f)).sort());
 const previous=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only',scope.base,'--','src','supabase'],{encoding:'utf8'}).trim().split('\n'));
 const inventory=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src','supabase'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 assert.deepEqual(inventory.filter(f=>!previous.has(f)).sort(),[...scope.added].sort());
});
