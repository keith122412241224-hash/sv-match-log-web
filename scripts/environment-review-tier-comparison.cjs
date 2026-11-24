/* eslint-disable @typescript-eslint/no-require-imports */
// Input is the anonymous, cutoff-aware output of environment-review-backtest.cjs.
const fs = require("node:fs");
const {strength, anchoredStrength, encounterTier} = require("../src/lib/environment-review/assessment-v3");
const [input, output] = process.argv.slice(2);
const windows = JSON.parse(fs.readFileSync(input,"utf8"));
for (const w of windows) for (const d of w.decks) {
  const deck = {eligibleCount:d.n, encounters:d.encounters, encounterRate:d.encounterRate, short:{encounters:d.recentEncounters},
    model:{majorMatchups:d.major,direct:d.direct,reversed:d.reversed,upper:d.upper,estimatedRate:d.estimated,bias:d.bias,
      signals:d.signals.filter(k=>k!=="trend").map(kind=>({kind})).concat(d.signals.includes("trend") ?
        [{kind:"trend",direction:Math.sign(d.short.winRate-d.rate)}] : [])}};
  const period = {matchCount:w.matches,shortMatchCount:w.shortMatches};
  d.methods={A:d.A,B:encounterTier(d.encounterRate),C:strength(deck,period).tier,D:anchoredStrength(deck,period).tier};
}
const top=t=>t!=null && t<=2;
function summarize(ws, method,h) {
  const counts=[0,0,0,0,0,0];
  let calls=0, actual=0, hits=0, seen=0,total=0,wins=0,games=0,small=0,smallHigh=0,smallHighUpper=0;
  let adjacent=0,moved=0,jumps=0,newMajor=0,capturedNew=0,fieldSum=0,fieldN=0;
  for(let i=0;i<ws.length;i++){
    const w=ws[i], prior=ws[i-1];
    const future=w.decks.find(d=>d.futureEncounters[h]);
    if(future) total+=future.futureEncounters[h][1];
    for(const d of w.decks){
      const t=d.methods[method];
      counts[t??0]++;
      const previous=prior?.envNo===w.envNo && prior.k===w.k-1 ? prior.decks.find(x=>x.id===d.id)?.methods[method] : null;
      if(previous!=null && t!=null){adjacent++;moved+=Number(t!==previous);jumps+=Number(Math.abs(t-previous)>=2);}
      const f=d.futureEncounters[h]; if(!f) continue;
      const isMajor=f[1]>0 && 10*f[0]>=f[1],called=top(t);
      actual+=Number(isMajor);calls+=Number(called);hits+=Number(called && isMajor);
      if(isMajor && d.encounterRate<10){newMajor++;capturedNew+=Number(called);}
      if(d.n>0 && d.n<20 && d.rate>=60){smallHigh++;smallHighUpper+=Number(called);}
      if(!called)continue;
      small+=Number(d.n<20);seen+=f[0];
      if(d.future[h]?.[1]>=10){wins+=d.future[h][0];games+=d.future[h][1];}
      const observed=d.major.filter(p=>p.used), mass=observed.reduce((s,p)=>s+p.weight,0);
      if(mass){fieldSum+=observed.reduce((s,p)=>s+p.weight*p.estimatedRate,0)/mass;fieldN++;}
    }
  }
  const pct=(x,n)=>n?100*x/n:null;
  return {method,h,counts,calls,actual,hits,precision:pct(hits,calls),recall:pct(hits,actual),f1:pct(2*hits,calls+actual),
    seen,total,share:pct(seen,total),wins,games,winRate:pct(wins,games),small,smallHigh,smallHighUpper,adjacent,moved,jumps,
    newMajor,capturedNew,observedFieldRate:fieldN?fieldSum/fieldN:null,fieldN};
}
const groups={development:windows.filter(w=>w.envNo!==5),lastEnvironment:windows.filter(w=>w.envNo===5),all:windows};
const result=Object.fromEntries(Object.entries(groups).map(([k,ws])=>[k,{windows:ws.length,rows:[3,7].flatMap(h=>["A","B","C","D"].map(m=>summarize(ws,m,h)))}]));
fs.writeFileSync(output,JSON.stringify(result,null,2));
