/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const navigation=require.resolve('next/navigation');require.cache[navigation]={id:navigation,filename:navigation,loaded:true,exports:{useRouter:()=>({})}};
const {DeckSelectDialog}=require('../src/components/DeckSelectDialog'),{QuickMatchForm}=require('../src/components/matches/QuickMatchForm'),{AnalysisFilters}=require('../src/components/analysis/AnalysisFilters');
const decks=[{id:'a',name:'同名デッキ',class_name:'エルフ'},{id:'b',name:'同名デッキ',class_name:'ロイヤル'}];
test('deck dialog: ID-based named form value, visible selected name/icon and accessible lazy trigger',()=>{
 const html=render(React.createElement(DeckSelectDialog,{decks,value:'b',name:'myDeck',label:'使用デッキ',onChange:()=>{}}));
 assert.match(html,/name="myDeck" value="b"/);assert.match(html,/同名デッキ/);assert.match(html,/aria-haspopup="dialog"/);assert.match(html,/aria-expanded="false"/);assert.match(decodeURIComponent(html),new RegExp(encodeURIComponent('ロイヤル')));assert.doesNotMatch(html,/<dialog|aria-pressed/);
});
test('deck dialog: all is empty, missing legacy ID is preserved and unknown class remains readable',()=>{
 for(const [value,label]of [['','すべて'],['missing','元のデッキ（現在選択肢なし）']]){
  const html=render(React.createElement(DeckSelectDialog,{decks,value,name:'opponentDeck',label:'相手デッキ',allowAll:true,onChange:()=>{}}));assert.match(html,new RegExp('name="opponentDeck" value="'+value+'"'));assert.ok(html.includes(label));
 }
 const html=render(React.createElement(DeckSelectDialog,{decks:[{id:'future',name:'未来のデッキ',class_name:'未来クラス'}],value:'future',label:'使用デッキ',onChange:()=>{}}));assert.match(html,/未来のデッキ/);
});
test('deck dialog state transitions: deduplicate IDs, canonical/unknown groups, counts, expand-only, choose, cancel and all',()=>{
 // Execute the actual component handlers with deterministic hook slots; native focus/inert is covered in browsers.
 const reactId=require.resolve('react'),domId=require.resolve('react-dom'),componentId=require.resolve('../src/components/DeckSelectDialog');
 const savedReact=require.cache[reactId].exports,savedDom=require.cache[domId].exports,savedComponent=require.cache[componentId],savedDocument=global.document;
 const states=[],refs=[];let slot=0,refSlot=0;
 require.cache[reactId].exports={...savedReact,useId:()=>':test:',useMemo:fn=>fn(),useEffect:()=>{},useRef:()=>refs[refSlot++]??={current:null},useState:initial=>{const i=slot++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
 require.cache[domId].exports={...savedDom,createPortal:child=>child};delete require.cache[componentId];global.document={body:{}};
 try{
  const Component=require('../src/components/DeckSelectDialog').DeckSelectDialog,changes=[];
  const props={label:'使用デッキ',value:'a',allowAll:true,onChange:id=>changes.push(id),decks:[decks[1],decks[0],decks[0],{id:'u',name:'未知デッキ',class_name:'未来クラス'},{id:'blank',name:'旧デッキ',class_name:''}]};
  const renderTree=()=>{slot=0;refSlot=0;return Component(props);};
  const all=node=>Array.isArray(node)?node.flatMap(all):React.isValidElement(node)?[node,...all(node.props.children)]:[];
  const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):node??'';
  const buttons=()=>all(renderTree()).filter(e=>e.type==='button');
  buttons().find(e=>e.props['aria-haspopup']==='dialog').props.onClick();
  const groups=buttons().filter(e=>e.props['aria-controls']&&!e.props['aria-haspopup']);
  assert.deepEqual(groups.map(e=>text(e.props.children)),['エルフ（1デッキ）','ロイヤル（1デッキ）','未来クラス（1デッキ）','クラス未設定（1デッキ）']);
  const currentGroups=()=>buttons().filter(e=>e.props['aria-controls']&&!e.props['aria-haspopup']);
  const assertCollapsed=()=>assert.ok(currentGroups().every(e=>e.props['aria-expanded']===false));
  assertCollapsed();assert.deepEqual(changes,[]);
  groups[0].props.onClick();groups[1].props.onClick();
  assert.deepEqual(currentGroups().map(e=>e.props['aria-expanded']),[true,true,false,false]);
  currentGroups()[1].props.onClick();
  assert.deepEqual(currentGroups().map(e=>e.props['aria-expanded']),[true,false,false,false]);
  groups[1].props.onClick();assert.deepEqual(changes,[]);assert.equal(buttons().find(e=>text(e.props.children)==='ロイヤル（1デッキ）').props['aria-expanded'],true);
  assert.equal(buttons().filter(e=>e.props['aria-pressed']===true).length,1);
  currentGroups()[2].props.onClick();buttons().find(e=>text(e.props.children)==='未知デッキ').props.onClick();assert.deepEqual(changes,['u']);assert.equal(all(renderTree()).some(e=>e.type==='dialog'),false);
  props.value='u';
  buttons().find(e=>e.props['aria-haspopup']==='dialog').props.onClick();assertCollapsed();assert.equal(buttons().find(e=>e.props['aria-pressed']===true).props.children.at(-1).props.children,'未知デッキ');
  currentGroups()[2].props.onClick();buttons().find(e=>text(e.props.children)==='キャンセル').props.onClick();assert.deepEqual(changes,['u']);
  buttons().find(e=>e.props['aria-haspopup']==='dialog').props.onClick();assertCollapsed();buttons().find(e=>text(e.props.children)==='キャンセル').props.onClick();assert.equal(props.value,'u');
  buttons().find(e=>e.props['aria-haspopup']==='dialog').props.onClick();buttons().find(e=>text(e.props.children)==='すべて').props.onClick();assert.deepEqual(changes,['u','']);
 }finally{require.cache[reactId].exports=savedReact;require.cache[domId].exports=savedDom;require.cache[componentId]=savedComponent;if(savedDocument===undefined)delete global.document;else global.document=savedDocument;}
});
test('match editor: active, legacy, inactive and missing selections keep both original form IDs',()=>{
 for(const archetypes of [decks,[]])for(const [my,opponent]of [['a','b'],['missing-a','missing-b'],[null,null]]){
  const match={my_archetype_id:my,opponent_archetype_id:opponent,my_deck_id:'legacy-a',opponent_deck_id:'legacy-b',environment_id:'env',played_at:'2026-10-21T00:00:00Z',result:'win',turn_order:'first'};
  const html=render(React.createElement(QuickMatchForm,{decks:[],archetypes,environments:[{id:'env',name:'環境',allow_match_input:true}],initialMatch:match}));
  assert.match(html,new RegExp('name="'+(my?'my_archetype_id':'my_deck_id')+'"[^>]*value="'+(my||'legacy-a')+'"'));
  assert.match(html,new RegExp('name="'+(opponent?'opponent_archetype_id':'opponent_deck_id')+'"[^>]*value="'+(opponent||'legacy-b')+'"'));
  assert.equal((html.match(/aria-haspopup="dialog"/g)||[]).length,3);assert.doesNotMatch(html,/<option[^>]*value="[ab]"/);
 }
});
test('analysis controls: independent IDs, empty all, legacy values and admin scope preserve form contract',()=>{
 for(const isAdmin of [true,false])for(const [my,opponent]of [['a','a'],['','b'],['missing','']]){
  const html=render(React.createElement(AnalysisFilters,{decks,environments:[],canUseAllUsers:isAdmin,onDeckChange:()=>{},values:{myDeckId:my,opponentDeckId:opponent,environmentId:'',scope:'mine',winRateMode:'direct',turnOrder:'',result:'',playedFrom:'',playedTo:''}}));
  assert.match(html,new RegExp('name="myDeck" value="'+my+'"'));assert.match(html,new RegExp('name="opponentDeck" value="'+opponent+'"'));assert.equal(html.includes('name="scope"'),isAdmin);assert.match(html,/type="submit">表示/);
 }
});
test('deck selection scope: exact five UI files; every server, aggregation, DB, rank, Guest persistence and dependency byte unchanged',()=>{
 const s=require('./deck-select-dialog-scope.cjs'),cp=require('node:child_process'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(s.hashes).sort(),['src/components/ClassIcon.tsx','src/components/DeckSelectDialog.tsx','src/components/analysis/AnalysisDashboard.tsx','src/components/analysis/AnalysisFilters.tsx','src/components/matches/QuickMatchForm.tsx'].sort());
 for(const f of Object.keys(s.hashes))s.assertReviewed(f);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeDeckSelect(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
 const current=s.read('src/components/matches/QuickMatchForm.tsx'),before=git('show',s.base+':src/components/matches/QuickMatchForm.tsx');
 const submit=x=>x.slice(x.indexOf('  async function handleSubmit'),x.indexOf('\n  return (\n    <form'));
 assert.equal(submit(current),submit(before),'all new/edit/Guest submit logic remains byte identical');
 const dashboard=s.read('src/components/analysis/AnalysisDashboard.tsx'),old=git('show',s.base+':src/components/analysis/AnalysisDashboard.tsx');
 const load=x=>x.slice(x.indexOf('  const load = useCallback'),x.indexOf('  useLayoutEffect'));
 assert.equal(load(dashboard),load(old),'RPC/loading/abort handling unchanged');
 const apply=x=>x.slice(x.indexOf('  function applyRanks'),x.indexOf('  const { environments'));
 assert.equal(apply(dashboard),apply(old),'rank/period FormData and URL logic unchanged');
});
