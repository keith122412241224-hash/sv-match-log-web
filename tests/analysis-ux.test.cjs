/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {quickAnalysisDates,analysisPeriodLabel,selectAnalysisSummaries,recentAnalysisStats}=require('../src/lib/analysis-presentation');
const {validateAnalysisDates}=require('../src/lib/analysis-date-query');
const summary=(id,total,winRate,class_name='エルフ')=>({deck:{id,name:id,class_name},total,winRate,firstWinRate:null,secondWinRate:null,isLowSample:false,goodMatchups:[],badMatchups:[],recentResults:[]});

test('quick periods use click-time JST minutes and exactly 168/720 hour endpoint differences, preserving inclusive end minutes',()=>{
 for(const now of ['2026-10-21T10:00:45.123Z','2026-01-01T00:00:00Z','2024-03-01T00:00:00Z'])for(const [period,hours]of [['7d',168],['30d',720]]){
  const dates=quickAnalysisDates(period,new Date(now)),parsed=validateAnalysisDates(dates);assert.equal(parsed.ok,true);
  assert.equal(Date.parse(parsed.value.playedAtTo)-Date.parse(parsed.value.playedAtFrom),hours*3600000+59999);
  assert.equal(Date.parse(parsed.value.playedAtTo),Math.floor(Date.parse(now)/60000)*60000+59999);
  assert.equal(analysisPeriodLabel(dates.playedFrom,dates.playedTo,period),period==='7d'?'直近7日':'直近30日');
 }
 assert.deepEqual(quickAnalysisDates('7d',new Date('2026-10-21T10:00:45.123Z')),{playedFrom:'2026-10-14T19:00',playedTo:'2026-10-21T19:00'});
 assert.deepEqual(quickAnalysisDates('all'),{playedFrom:'',playedTo:''});assert.equal(analysisPeriodLabel('','','all'),'全期間');
 assert.equal(analysisPeriodLabel('2026-10-14T19:00','2026-10-21T19:01','7d'),'カスタム期間');
 assert.equal(analysisPeriodLabel('2026-10-14T19:00','2026-10-21T19:00'),'カスタム期間');
});

test('summary order/filter is deterministic, uses perspective counts, leaves every source value and matchup untouched',()=>{
 const source=[summary('b',10,50,'ウィッチ'),summary('a',10,50,'エルフ'),summary('c',9,100,'ロイヤル'),summary('d',30,0,'不明'),summary('e',0,null),summary('f',12,null)];const before=structuredClone(source),ids=(sort,min=0)=>selectAnalysisSummaries(source,sort,min).map(s=>s.deck.id);
 assert.deepEqual(ids('count'),['d','f','a','b','c']);assert.deepEqual(ids('win-desc'),['c','a','b','d','f']);assert.deepEqual(ids('win-asc'),['d','a','b','c','f']);assert.deepEqual(ids('class'),['f','a','c','b','d']);assert.deepEqual(ids('count',10),['d','f','a','b']);assert.deepEqual(ids('count',100),[]);
 assert.deepEqual(source,before);for(const sort of ['count','class','win-desc','win-asc'])assert.deepEqual(selectAnalysisSummaries([...source].reverse(),sort,0).map(s=>s.deck.id),ids(sort));assert.deepEqual(selectAnalysisSummaries([], 'count',0),[]);
});

test('recent results use actual N, newest prefix streak, and bounded-ten wording',()=>{
 const results=s=>s.split('').map(c=>c==='W'?'win':'lose');
 for(const [sequence,wins,losses,streak,label]of [['WWWLW',4,1,3,'現在3連勝'],['LLWWL',2,3,2,'現在2連敗'],['WLW',2,1,1,'現在1連勝'],['WWWWWWWWWW',10,0,10,'直近10件すべて勝利'],['LLLLLLLLLL',0,10,10,'直近10件すべて敗北']]){
  const input=results(sequence),before=[...input],r=recentAnalysisStats(input);assert.equal(r.count,input.length);assert.equal(r.wins,wins);assert.equal(r.losses,losses);assert.equal(r.winRate,wins/input.length*100);assert.equal(r.streak,streak);assert.equal(r.streakLabel,label);assert.deepEqual(input,before);
 }
 assert.deepEqual(recentAnalysisStats([]),{count:0,wins:0,losses:0,winRate:null,streak:0,streakLabel:''});
});

test('recent stats render in all four modes; streak only mine/direct; Guest default rendering stays unchanged',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{DeckAnalysisCards}=require('../src/components/analysis/DeckAnalysisCards');
 const s={...summary('test',3,200/3),recentResults:['win','win','lose']};
 for(const scope of ['mine','all'])for(const combined of [false,true]){
  const html=renderToStaticMarkup(React.createElement(DeckAnalysisCards,{summaries:[s],combined,recentDetails:true,showStreak:scope==='mine'&&!combined}));
  assert.match(html,/2勝1敗/);assert.match(html,/66\.7%/);assert.match(html,combined?/直近3件（反転込み）/:/直近3戦/);assert.equal(html.includes('現在2連勝'),scope==='mine'&&!combined);assert.doesNotMatch(html,/現在の分析条件|連勝・連敗もこの対象範囲|連勝・連敗は自分のみ/);assert.equal((html.match(/>W<|>L</g)||[]).length,3);
 }
 const html=renderToStaticMarkup(React.createElement(DeckAnalysisCards,{summaries:[s]}));assert.doesNotMatch(html,/現在2連勝|2勝1敗|現在の分析条件/);assert.match(html,/直近10戦/);
});

test('analysis bars preserve row order/counts/rates, clamp width, and show missing turn data without NaN',()=>{
 const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server'),{AnalysisWinRates}=require('../src/components/analysis/AnalysisWinRates');
 const rows=[{label:'long'.repeat(40),total:8,wins:5,winRate:62.5},{label:'zero',total:0,wins:0,winRate:null},{label:'undefined',total:1,wins:0},{label:'clamp',total:1,wins:1,winRate:110}];
 const html=render(React.createElement(AnalysisWinRates,{rows}));assert.ok(html.indexOf(rows[0].label)<html.indexOf('zero'));assert.match(html,/62\.5%/);assert.match(html,/5勝 \/ 8戦/);assert.match(html,/width:62\.5%/);assert.match(html,/width:100%/);assert.doesNotMatch(html,/NaN|width:110%/);
 assert.match(render(React.createElement(AnalysisWinRates,{rows,combined:true})),/8件（対象件数）/);
 const turns=render(React.createElement(AnalysisWinRates,{rows:[{label:'後攻',total:1,wins:0,winRate:0}],turns:true}));assert.ok(turns.indexOf('先攻')<turns.indexOf('後攻'));assert.match(turns,/データなし/);assert.match(turns,/>0%/);
 assert.match(render(React.createElement(AnalysisWinRates,{rows:[]})),/表示できるデータがありません/);
});

test('analysis description cleanup removes only two paragraphs and retains collapsed content/export controls',()=>{
 const scope=require('./analysis-description-scope.cjs');
 assert.equal(Object.keys(scope.removed).length,2);Object.keys(scope.removed).forEach(scope.readBeforeDescriptions);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{ExportableAnalysisBlock}=require('../src/components/analysis/ExportableAnalysisBlock');
 const html=renderToStaticMarkup(React.createElement(ExportableAnalysisBlock,{title:'対面別勝率',filename:'matchups',collapsible:true},React.createElement('table',null,React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',null,'66.7%'))))));
 assert.doesNotMatch(html,/使用デッキと相手デッキの組み合わせ別|閉じた状態でもPNGに/);
 assert.match(html,/aria-expanded="false"/);assert.match(html,/hidden="" data-png-expand/);assert.match(html,/対面別勝率をPNG保存/);assert.match(html,/66\.7%/);
});

test('Analysis UX scope pins only presentation and keeps all existing server/API/SQL/auth/aggregate/dependency files identical',()=>{
 const cp=require('node:child_process'),s=require('./analysis-ux-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).replaceAll('\r\n','\n');
 for(const f of Object.keys(s.hashes))s.assertReviewed(f);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeAnalysisUx(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
 const dashboard=require('./deck-select-dialog-scope.cjs').readBeforeDeckSelect('src/components/analysis/AnalysisDashboard.tsx'),before=git('show',s.base+':src/components/analysis/AnalysisDashboard.tsx');
 const load=x=>x.slice(x.indexOf('  const load = useCallback'),x.indexOf('  function applyRanks'));
 const expectedLoad=load(before).replace("      const response = await fetch('/api/analysis?' + query,", "      // The preset is presentation metadata in the URL; the existing API accepts dates only.\n      const apiQuery = new URLSearchParams(query); apiQuery.delete('periodPreset');\n      const response = await fetch('/api/analysis?' + apiQuery,")
 .replace("        setData(next); currentQuery.current = query.toString();","        setData(next); currentQuery.current = query.toString();\n        setPeriodPreset(query.get('periodPreset') ?? undefined);")
 .replace('    setData(initialData); setPending(false); setFailed(false);',"    setData(initialData); setPending(false); setFailed(false);\n    setPeriodPreset(query.get('periodPreset') ?? undefined);");
 assert.equal(load(dashboard),expectedLoad,'only strip presentation metadata and synchronize its label; existing abort, navigation and RPC handling unchanged');
 const table=x=>x.slice(x.indexOf('<table className="w-full min-w-[720px]'),x.indexOf('</table>')+8);assert.equal(table(dashboard),table(before),'complete matchup table unchanged');
});
