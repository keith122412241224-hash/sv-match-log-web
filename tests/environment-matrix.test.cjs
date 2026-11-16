/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
const { buildEnvironmentMatrix: build } = require('../src/lib/environment-matrix');
const { buildWinRateMatrixFromAggregates: personal } = require('../src/lib/matchup-aggregates');
const { MatchupMatrix } = require('../src/components/MatchupMatrix');
const decks = ['a','b','c'].map(id => ({ id, name: id.toUpperCase(), class_name: 'エルフ' }));
const group = (a,b,total,wins) => ({ myDeckId:a, opponentDeckId:b, total,wins });
const payload = groups => ({ version:1, totalMatches:groups.reduce((sum,g)=>sum+g.total,0), groups });
const at = (rows,a,b) => rows.find(r=>r.myDeck.id===a).cells.find(c=>c.opponentDeckId===b);
const opposite = { favored:'unfavored', slightly_favored:'slightly_unfavored', even:'even', slightly_unfavored:'slightly_favored', unfavored:'favored' };

test('environment combines wins and reversed losses, preserves registered total and immutable source',()=>{
  const data=payload([group('a','b',10,6),group('b','a',4,1),group('a','a',3,2),group(null,'b',2,1),group('hidden','a',1,1)]);
  const before=structuredClone(data);data.groups.forEach(Object.freeze);Object.freeze(data.groups);Object.freeze(data);
  const rows=build(data,decks),a=at(rows,'a','b'),b=at(rows,'b','a');
  assert.equal(a.total,14);assert.equal(a.wins,9);assert.equal(b.total,14);assert.equal(b.wins,5);
  assert.equal(a.displayWinRate,64.3);assert.equal(b.displayWinRate,35.7);
  assert.equal(a.winRate+b.winRate,100);assert.deepEqual(data,before);assert.equal(data.totalMatches,20);
  assert.equal(at(rows,'a','a').total,3);assert.deepEqual(rows.map(r=>r.myDeck.id),['a','b','c']);
  assert.equal(rows.flatMap(r=>r.cells).length,9);
  assert.deepEqual(at(build(data,[...decks].reverse()),'a','b'),a);
});

test('one direction fills its reverse; zero/full wins, half ties and count-independent symmetric bands',()=>{
  for(const total of [1,4,5,16,20,100,2000]) for(let wins=0;wins<=total;wins++) {
    const rows=build(payload([group('b','a',total,wins)]),decks),a=at(rows,'a','b'),b=at(rows,'b','a');
    assert.equal(a.total,total);assert.equal(a.wins,total-wins);assert.equal(b.wins,wins);
    assert.equal(Math.round(a.displayWinRate*10)+Math.round(b.displayWinRate*10),1000);
    assert.equal(a.winRate+b.winRate,100);assert.equal(opposite[a.band],b.band);
    // Integer oracle avoids 11/20*100 becoming 55.00000000000001.
    const percent=(total-wins)*100;
    assert.equal(a.band,percent>60*total?'favored':percent>55*total?'slightly_favored':percent>=45*total?'even':percent>=40*total?'slightly_unfavored':'unfavored');
  }
  const rows=build(payload([group('a','b',16,1)]),decks);
  assert.equal(at(rows,'a','b').displayWinRate,6.3);assert.equal(at(rows,'b','a').displayWinRate,93.7);
  for(const [wins,total] of [[0,1],[1,1],[2,4],[10,20],[15,25],[30,50]]) {
    const cell=at(build(payload([group('a','b',total,wins)]),decks),'a','b');
    const scaled=at(build(payload([group('a','b',total*10,wins*10)]),decks),'a','b');
    assert.equal(cell.band,scaled.band);
  }
});

test('exact 40/45/50/55/60 boundaries and adjacent fractions have complementary colors',()=>{
  const expected=[[799,'unfavored'],[800,'slightly_unfavored'],[899,'slightly_unfavored'],[900,'even'],[1000,'even'],[1100,'even'],[1101,'slightly_favored'],[1200,'slightly_favored'],[1201,'favored']];
  for(const [wins,band] of expected) {
    const rows=build(payload([group('a','b',2000,wins)]),decks);
    assert.equal(at(rows,'a','b').band,band);assert.equal(at(rows,'b','a').band,opposite[band]);
  }
  const large=at(build(payload([group('a','b',Number.MAX_SAFE_INTEGER,1)]),decks),'a','b');
  assert.equal(large.displayWinRate,0);assert.equal(large.band,'unfavored');
});

test('environment cells show only fixed-one-decimal rate and counts; mirrors neutral, zero is data missing',()=>{
  for(const groups of [[],[group('a','a',1,1),group('a','b',1,1)],[group('a','b',25,15)]]) {
    const rows=build(payload(groups),decks);
    const html=render(React.createElement(MatchupMatrix,{rows,opponentDecks:decks,environmentMode:true,showSupplementaryInfo:false,createdAtLabel:'2026/11/16',populationLabel:'環境全体 / ランク: A / 対象登録戦績: 26件'}));
    const cells=[...html.matchAll(/<td class="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)];
    for(const [i,cell] of cells.entries()) {
      const value=rows.flatMap(r=>r.cells)[i],contents=cell[2].replace(/<[^>]+>/g,'');
      if(value.myDeckId===value.opponentDeckId){assert.equal(contents,'—');assert.match(cell[1],/bg-slate-100/);}
      else if(!value.total)assert.equal(contents,'データなし');
      else assert.equal(contents,`${value.displayWinRate.toFixed(1)}%${value.wins}勝 / ${value.total}戦`);
    }
    assert.doesNotMatch(html,/サンプル不足|少数データ|参考値|注意アイコン/);
    assert.doesNotMatch(html,/対象登録戦績|登録戦績ベース|作成日|表示デッキの選択前/);
  }
});

test('personal and Guest rendering including mirrors is byte-identical to pre-change renderer',()=>{
  const cp=require('node:child_process'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
  const file='src/components/MatchupMatrix.tsx',filename=path.resolve(file),baseline=new Module(filename,module);
  baseline.filename=filename;baseline.paths=module.paths;
  baseline._compile(ts.transpileModule(cp.execFileSync('git',['show','bdbeafc:'+file],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
  for(const title of ['対面勝率表','ゲスト対面勝率表'])for(const wins of [0,4,5,9,10,11,12,13,20]) {
    const props={rows:personal(payload([group('a','a',20,wins),group('a','b',20,wins),group('b','a',1,1)]),decks,decks),opponentDecks:decks,title,createdAtLabel:'2026/11/16'};
    assert.equal(render(React.createElement(MatchupMatrix,props)),render(React.createElement(baseline.exports.MatchupMatrix,props)));
  }
});

test('simplified member headers remove only supplementary paragraphs; all controls, cells, colors and export layout remain unchanged',()=>{
  const cp=require('node:child_process'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
  const file='src/components/MatchupMatrix.tsx',filename=path.resolve(file),baseline=new Module(filename,module);
  baseline.filename=filename;baseline.paths=module.paths;
  baseline._compile(ts.transpileModule(cp.execFileSync('git',['show','d2421c0:'+file],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
  for(const environmentMode of [false,true])for(const wins of [0,4,5,9,10,11,12,13,20]) {
    const data=payload([group('a','a',20,wins),group('a','b',20,wins),group('b','a',1,1)]);
    const props={rows:environmentMode?build(data,decks):personal(data,decks,decks),opponentDecks:decks,environmentMode,environmentName:'変動する環境名',createdAtLabel:'2030/12/31',populationLabel:`対象登録戦績: ${data.totalMatches}件`};
    const before=render(React.createElement(baseline.exports.MatchupMatrix,props));
    const after=render(React.createElement(MatchupMatrix,{...props,showSupplementaryInfo:false}));
    const expected=before.replace(/<header\b[\s\S]*?<\/header>/,header=>header.replace(/<p\b[^>]*>[\s\S]*?<\/p>/g,''));
    assert.equal(after,expected,'only the header paragraphs may change');
    assert.doesNotMatch(after,/変動する環境名|2030\/12\/31|対象登録戦績|登録戦績ベース|作成日/);
    assert.match(after,/>対面勝率表<\/h2>/);
  }
});
