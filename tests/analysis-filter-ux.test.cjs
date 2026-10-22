/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {AnalysisFilters,summarizeAnalysisFilters}=require('../src/components/analysis/AnalysisFilters');
const {RANK_ATOMS}=require('../src/lib/rank-selection');
const values={environmentId:'env',scope:'mine',winRateMode:'direct',myDeckId:'',opponentDeckId:'',myDeckIds:null,opponentDeckIds:null,turnOrder:'',result:'',playedFrom:'',playedTo:'',rankSelection:RANK_ATOMS};
const decks=[{id:'a',name:'コンボエルフ',class_name:'エルフ'},{id:'b',name:'長いデッキ名'.repeat(20),class_name:'ウィッチ'}],environments=[{id:'env',name:'検証環境'}];
test('applied filter summary: all conditions, legacy single, multi, rank presets and member scope',()=>{
 assert.deepEqual(summarizeAnalysisFilters(values,decks,environments),{scope:'自分のみ',mode:'使用者側のみ',ranks:'全ランク',environment:'検証環境',myDeck:'すべて',opponentDeck:'すべて',period:'全期間',turn:'',result:''});
 const selected={...values,scope:'all',winRateMode:'combined',myDeckIds:['a','b'],opponentDeckIds:['b'],rankSelection:['master:ruby','grandmaster:epic'],turnOrder:'second',result:'lose'};
 const s=summarizeAnalysisFilters(selected,decks,environments,undefined,true);assert.equal(s.scope,'全ユーザー');assert.equal(s.mode,'反転込み');assert.equal(s.ranks,'カスタム（2区分）');assert.equal(s.myDeck,'2デッキ');assert.equal(s.opponentDeck,decks[1].name);assert.equal(s.turn,'後攻');assert.equal(s.result,'負け');
 assert.equal(summarizeAnalysisFilters(selected,decks,environments).scope,'自分のみ');
 assert.equal(summarizeAnalysisFilters({...values,myDeckIds:undefined,myDeckId:'a'},decks,environments).myDeck,'コンボエルフ');
 assert.equal(summarizeAnalysisFilters({...values,myDeckIds:['missing']},decks,environments).myDeck,'元のデッキ（現在選択肢なし）');
});
test('applied summary uses JST endpoints; quick label requires matching actual period; custom/open dates remain explicit',()=>{
 const v={...values,playedFrom:'2026-10-14T19:00',playedTo:'2026-10-21T19:00'};
 assert.equal(summarizeAnalysisFilters(v,decks,environments,'7d').period,'直近7日');
 assert.equal(summarizeAnalysisFilters(v,decks,environments,'30d').period,'2026-10-14 19:00 〜 2026-10-21 19:00（日本時間）');
 assert.equal(summarizeAnalysisFilters({...v,playedFrom:''},decks,environments).period,'開始指定なし 〜 2026-10-21 19:00（日本時間）');
 assert.equal(summarizeAnalysisFilters({...v,playedTo:''},decks,environments).period,'2026-10-14 19:00 〜 終了指定なし（日本時間）');
 assert.equal(summarizeAnalysisFilters({...values,playedFrom:'2026-09-21T19:00',playedTo:'2026-10-21T19:00'},decks,environments,'30d').period,'直近30日');
});
test('filter SSR starts closed but retains complete form and controls; only admin gets scope control and badge',()=>{
 for(const admin of [false,true]){const html=render(React.createElement(AnalysisFilters,{values,decks,environments,canUseAllUsers:admin}));
 assert.match(html,/aria-expanded="false" aria-controls="([^"]+)"/);const id=html.match(/aria-expanded="false" aria-controls="([^"]+)"/)[1];assert.ok(html.includes(`id="${id}" hidden=""`));assert.match(html,/<form[^>]*action="\/analysis"/);
 for(const field of ['environment','winRateMode','myDeck','opponentDeck','turnOrder','result','playedFrom','playedTo'])assert.ok(html.includes(`name="${field}"`),field);
 for(const label of ['登録者のランク','直近7日','直近30日','全期間','表示','リセット'])assert.ok(html.includes(label));assert.equal(html.includes('name="scope"'),admin);assert.equal(html.includes('自分の戦績'),admin);assert.match(html,/aria-live="polite"/);
 }
});
test('filter UI scope: exactly three reviewed product files; RPC/API/DB/auth/result rendering and every unrelated byte unchanged',()=>{
 const s=require('./analysis-filter-ux-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).replaceAll('\r\n','\n');
 const expected=['src/components/analysis/AnalysisDashboard.tsx','src/components/analysis/AnalysisFilters.tsx','src/components/analysis/AnalysisFilterPanel.tsx'];assert.deepEqual(Object.keys(s.hashes).sort(),expected.sort());for(const f of expected)s.assertReviewed(f);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeFilterUx(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
 const dashboard=s.read(expected.find(f=>f.includes('Dashboard'))),before=git('show',s.base+':'+expected.find(f=>f.includes('Dashboard')));
 const results=x=>x.slice(x.indexOf('        <p className="text-sm text-muted">\n          勝率集計:'));
 assert.ok(results(dashboard).length>1000);assert.equal(results(dashboard),results(before),'every result, sort/filter, export and matchup remains identical');
});
