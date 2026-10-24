/* eslint-disable @typescript-eslint/no-require-imports */
const base = require('./environment-dashboard-v4-fixture.cjs');
const classes = ['エルフ','ロイヤル','ウィッチ','ドラゴン','ナイトメア','ビショップ','ネメシス',null];
const entries = classes.flatMap((className, c) => ['増加','減少','横ばい'].map((state, t) => ({ id:base.id(200+c*3+t), name:`${className ?? '未設定'}の${state}デッキ${c===0?'・とても長いデッキ名の表示確認':''}`, class_name:className, is_active:true, c,t })));
entries.push({id:base.id(240),name:'前期なし',class_name:'エルフ',is_active:true,c:0,t:3}, {id:base.id(241),name:'自分側のみ',class_name:'エルフ',is_active:true,c:0,t:4}, {id:base.id(242),name:'無効なデッキ',class_name:'エルフ',is_active:false,c:0,t:0});
const empty=()=>({encounter:{status:'no_data',count:null},winrate:{status:'no_data',targetRegistrations:null,evaluationCount:null,wins:null}});
function dashboard(args, mode='full') {
 const d=base.dashboard(args);d.current.total={status:'available',totalMatches:1000};if(d.previous)d.previous.total={status:'available',totalMatches:1000};
 d.decks=entries.map((e,i)=>{const count=[25,10,10,1,0][e.t],targets=e.t===3?1:e.t===4?4:30+i, evaluations=targets+(i%3), wins=e.t===3?1:Math.floor(evaluations*(0.2+(i%5)/10));
  const current={encounter:count?{status:'available',count}:{status:'no_data',count:null},winrate:{status:'available',targetRegistrations:targets,evaluationCount:evaluations,wins}};
  const previous={encounter:e.t!==3?{status:'available',count:e.t===4?1:[10,25,11][e.t]}:{status:'no_data',count:null},winrate:e.t!==3?{status:'available',targetRegistrations:40,evaluationCount:40,wins:20}:empty().winrate};
  return {key:e.id,name:e.name,className:e.class_name,current,previous:d.previous?previous:null};});
 d.decks.push({key:'unclassified',name:'未分類',className:null,current:empty(),previous:d.previous?empty():null});
 if(mode==='empty'){d.current.total={status:'no_data',totalMatches:null};if(d.previous)d.previous.total={status:'no_data',totalMatches:null};d.decks.forEach(e=>{e.current=empty();if(d.previous)e.previous=empty();});}
 if(mode==='no-previous'&&d.previous){d.previous.total={status:'no_data',totalMatches:null};d.decks.forEach(e=>{e.previous=empty();});}
 return d;
}
module.exports={...base,classes,decks:entries,dashboard};
