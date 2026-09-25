// HTTP stub only. Actual SQL parity/RLS are tested by analysis-rpc.integration.cjs.
function analysisFixture(records,args){
  const source=records.filter(r=>(!args.p_environment_id||r.environment_id===args.p_environment_id)
    &&(!args.p_played_from||r.played_at>=args.p_played_from)&&(!args.p_played_to||r.played_at<=args.p_played_to))
    .sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
  const views=source.flatMap(r=>[{...r,source:'direct'},...(args.p_include_reversed?[{...r,source:'reversed',my_deck_id:r.opponent_deck_id,opponent_deck_id:r.my_deck_id,my_archetype_id:r.opponent_archetype_id,opponent_archetype_id:r.my_archetype_id,result:r.result==='win'?'lose':'win',turn_order:r.turn_order==='first'?'second':'first'}]:[])])
    .filter(r=>(!args.p_my_deck_id||(args.p_use_archetype?r.my_archetype_id:r.my_deck_id)===args.p_my_deck_id)
      &&(!args.p_opponent_deck_id||(args.p_use_archetype?r.opponent_archetype_id:r.opponent_deck_id)===args.p_opponent_deck_id)
      &&(!args.p_result||r.result===args.p_result)&&(!args.p_turn_order||r.turn_order===args.p_turn_order));
  const groups=new Map(),recent=new Map();
  views.forEach((v,i)=>{
    const ids=[v.my_archetype_id??v.my_deck_id,v.opponent_archetype_id??v.opponent_deck_id];
    const cardIds=args.p_use_archetype?ids:[v.my_deck_id,v.opponent_deck_id];const key=JSON.stringify([...ids,...cardIds,v.turn_order]);
    const g=groups.get(key)||{myDeckId:ids[0],opponentDeckId:ids[1],cardMyDeckId:cardIds[0],cardOpponentDeckId:cardIds[1],turnOrder:v.turn_order,total:0,wins:0,firstOrder:i+1};
    g.total++;g.wins+=v.result==='win'?1:0;groups.set(key,g);
    const r=recent.get(cardIds[0])||{deckId:cardIds[0],views:[]};if(r.views.length<10)r.views.push({id:v.id,playedAt:v.played_at,source:v.source,result:v.result,turnOrder:v.turn_order,order:i+1});recent.set(cardIds[0],r);
  });
  return {version:1,registeredMatches:new Set(views.map(v=>v.id)).size,perspectives:views.length,totalWins:views.filter(v=>v.result==='win').length,groups:[...groups.values()],recent:[...recent.values()].filter(r=>!args.p_recent_deck_ids||args.p_recent_deck_ids.includes(r.deckId))};
}
module.exports={analysisFixture};
