// Synthetic HTTP boundary only. SQL correctness is tested separately on PostgreSQL.
function periodCounts(records) {
  const ordered=[...records].sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
  const groups=new Map();
  ordered.forEach((m,i)=>{
    const myDeckId=m.my_archetype_id??m.my_deck_id,opponentDeckId=m.opponent_archetype_id??m.opponent_deck_id;
    const key=JSON.stringify([myDeckId,opponentDeckId]);
    const g=groups.get(key)||{myDeckId,opponentDeckId,total:0,wins:0,firstOrdinal:i+1};
    g.total++;g.wins+=m.result==='win'?1:0;groups.set(key,g);
  });
  return {totalMatches:records.length,groups:[...groups.values()]};
}
function periodFixture(records,args) {
  const period=(a,b)=>periodCounts(records.filter(m=>m.played_at>=a&&m.played_at<=b));
  return {version:1,current:period(args.p_current_start,args.p_current_end),previous:period(args.p_previous_start,args.p_previous_end)};
}
module.exports={periodCounts,periodFixture};
