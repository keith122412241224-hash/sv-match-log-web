/* eslint-disable @typescript-eslint/no-require-imports */
// Run via node --require ./tests/register.cjs with the v2 rolling-window export.
const fs=require("node:fs");
const {strength,cellLabel,encounterTier}=require("../src/lib/environment-review/assessment-v3");
const [input,output]=process.argv.slice(2);
const windows=JSON.parse(fs.readFileSync(input,"utf8").replace(/^\uFEFF/u,""));
const avg=a=>a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
function ranks(a) {
  return a.map(x=>a.filter(y=>y<x).length+(a.filter(y=>y===x).length+1)/2);
}
function rho(rows) {
  if(rows.length<3) return null;
  const a=ranks(rows.map(r=>r[0])), b=ranks(rows.map(r=>r[1])), ma=avg(a),mb=avg(b);
  const covariance=a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0);
  const scale=Math.sqrt(a.reduce((s,v)=>s+(v-ma)**2,0)*b.reduce((s,v)=>s+(v-mb)**2,0));
  return scale ? covariance/scale : null;
}
for(const w of windows) for(const d of w.decks) {
  if(!Object.hasOwn(d,"encounters")) throw Error("再出力した遭遇数付きローリング集計が必要です。");
  d.presence=encounterTier(d.encounterRate);
  d.v3=strength({eligibleCount:d.n,encounters:d.encounters,encounterRate:d.encounterRate,short:{encounters:d.recentEncounters},
    model:{majorMatchups:d.major,direct:d.direct,reversed:d.reversed,upper:d.upper,signals:d.signals.map(kind=>({kind}))}},
    {matchCount:w.matches,shortMatchCount:w.shortMatches}).tier;
}
function summarize(h,method,periods=windows) {
  const key=method==="v2"?"A":method==="encounter"?"presence":"v3";
  const exposure={futureGames:0,upperEncounters:0,majorKnown:0,majorCalled:0,majorUpper:0,upperWithLittleData:0,upperCount:0,differentFromEncounter:0,assessed:0};
  const correlations=[], tierWins=[0,0], pair={eligible:0,called:0,hits:0,soft:0,softHits:0}, decks={eligible:0,hold:0,low:0};
  for(const w of periods) {
    const future=w.decks.find(d=>d.futureEncounters[h]);
    if(future){
      exposure.futureGames+=future.futureEncounters[h][1];
      for(const d of w.decks){
        const [seen,total]=d.futureEncounters[h], t=d[key], top=t!==null && t<=2;
        if(t!==null){exposure.assessed++; exposure.differentFromEncounter+=Number(t!==d.presence);}
        if(top){exposure.upperEncounters+=seen;exposure.upperCount++;exposure.upperWithLittleData+=Number(d.n<20);}
        if(total && seen/total>=.1) {exposure.majorKnown++;exposure.majorCalled+=Number(top);}
        if(top && total && seen/total>=.1) exposure.majorUpper++;
      }
    }
    const evaluated=w.decks.filter(d=>d.future[h]?.[1]>=10);
    const observations=[];
    for(const d of evaluated) {
      const t=d[key];
      decks.eligible++;
      if(t===null) {decks.hold++;continue;}
      if(d.confidence==="低") decks.low++;
      const [wins,n]=d.future[h];
      observations.push([-t,wins/n]);
      if(t<=2) {tierWins[0]+=wins;tierWins[1]+=n;}
    }
    const r=rho(observations); if(r!==null) correlations.push(r);
    for(const p of w.pairs.filter(p=>p.future[h]?.[1]>=5)) {
      pair.eligible++;
      const label=cellLabel(p.C,p.wins,p.n);
      const soft=method==="v3" && p.C===null ? label==="有利傾向"?1:label==="不利傾向"?-1:0 : 0;
      const dir=Math.sign(p.C ?? soft);
      if(!dir) continue;
      const [wins,n]=p.future[h], hit=dir===Math.sign(2*wins-n);
      pair.called++;pair.hits+=Number(hit);
      if(soft) {pair.soft++;pair.softHits+=Number(hit);}
    }
  }
  return {h,method,exposure,spearman:avg(correlations),correlationWindows:correlations.length,tierWins,decks,pair};
}
const stability={comparisons:0,changes:0,twoSteps:0,small:0,smallChanged:0,biased:0,biasedChanged:0};
for(let i=1;i<windows.length;i++) {
  const a=windows[i-1],b=windows[i];
  if(a.envNo!==b.envNo || b.k-a.k!==1) continue;
  for(const d of b.decks) {
    const prior=a.decks.find(p=>p.id===d.id);
    if(!prior || prior.v3===null || d.v3===null) continue;
    const changed=prior.v3!==d.v3;
    stability.comparisons++;stability.changes+=Number(changed);stability.twoSteps+=Number(Math.abs(prior.v3-d.v3)>=2);
    if(d.n<20){stability.small++;stability.smallChanged+=Number(changed);}
    if(d.signals.includes("concentration")){stability.biased++;stability.biasedChanged+=Number(changed);}
  }
}
fs.writeFileSync(output,JSON.stringify({windows:windows.length,environments:new Set(windows.map(w=>w.envNo)).size,stability,
  byEnvironment:[...new Set(windows.map(w=>w.envNo))].map(envNo=>({envNo,results:["v2","encounter","v3"].map(m=>summarize(7,m,windows.filter(w=>w.envNo===envNo)))})),
  results:[3,7].flatMap(h=>["v2","encounter","v3"].map(m=>summarize(h,m)))},null,2));
