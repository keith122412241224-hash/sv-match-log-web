/* eslint-disable @typescript-eslint/no-require-imports */
// Offline only. Run with node --require ./tests/register.cjs. The SQL exports
// contain aggregate counts and catalog metadata, never accounts or match rows.
const fs = require("node:fs");
const path = require("node:path");
const { buildReviewSnapshotV2 } = require("../src/lib/environment-review/data-model.ts");
const { buildWeeklyReportFromAggregates, buildWeeklyPeriod } = require("../src/lib/weekly-report.ts");
const { periodDeckPerspectives, periodUnifiedCounts } = require("../src/lib/period-report-aggregates.ts");
const [input, output, closedThrough] = process.argv.slice(2);
if (!input || !output || !/^\d{4}-\d{2}-\d{2}$/.test(closedThrough || "")) {
  throw Error("Pass the aggregate directory, result JSON filename and exclusive JST observation end (YYYY-MM-DD).");
}
const read = file => JSON.parse(fs.readFileSync(path.join(input, file), "utf8").replace(/^\uFEFF/, ""));
const { env, catalog } = read("review-historical-meta.json");
const dayMs = 86400000;
const midnight = (start, offset) => new Date(Date.parse(start + "T00:00:00+09:00") + offset * dayMs).toISOString();
const dateLabel = (start, offset) => new Date(Date.parse(start + "T00:00:00Z") + offset * dayMs).toISOString().slice(0, 10);
const catalogById = new Map(catalog.map(r => [r[0], r]));
function byKind(prefix, envNo) {
  return fs.readdirSync(input).filter(f => f.startsWith(prefix + "-" + envNo + "-") && f.endsWith(".json")).map(read);
}
function grouped(cells) {
  const groups = new Map();
  let totalMatches = 0;
  for (const cell of cells) {
    const key = JSON.stringify([cell.my, cell.opp]);
    const g = groups.get(key) || { myDeckId: cell.my, opponentDeckId: cell.opp, total: 0, wins: 0, firstOrdinal: totalMatches + 1 };
    totalMatches += cell.total;
    g.total += cell.total;
    g.wins += cell.wins;
    groups.set(key, g);
  }
  return { totalMatches, groups: [...groups.values()] };
}
const results = [];
for (const [envNo, environmentId, environmentName, start, exactStart, end] of env) {
  const all = byKind("hcells", envNo).flat();
  const batches = byKind("hbias", envNo);
  const biasRows = batches.flatMap(x => x.rows);
  const extraBias = new Map(byKind("hextra", envNo).flat().map(r => [JSON.stringify(r.slice(0,4)),r.slice(4)]));
  const totalUsers = new Map(batches.flatMap(x => x.totals));
  const cuts = [...new Set(batches.flatMap(x => x.cuts))].sort((a, b) => a - b);
  for (const k of cuts) {
    const date = dateLabel(start, k), asOf = midnight(start, k);
    const map = new Map(catalog.filter(r => (!r[6] || r[6] === envNo) && Date.parse(r[5]) < Date.parse(asOf)).map(r => [r[0], r[1]]));
    const others = new Set(catalog.filter(r => r[4]).map(r => r[1]));
    function windowCells(lo, hi, knownBefore, weekly = false) {
      const catalogAtEnd = knownBefore === k ? map : new Map(catalog.filter(r => (!r[6] || r[6] === envNo) &&
        Date.parse(r[5]) < Date.parse(midnight(start, knownBefore))).map(r => [r[0], r[1]]));
      return all.filter(r => r[0] >= lo && r[0] < hi && r[1] < knownBefore).map(([day, , a, b, rank, first, fallback, total, wins]) => ({
        day: dateLabel(start, day), recent: day >= k - 3, rank, turn: first ? "first" : "second", total, wins,
        my: catalogAtEnd.get(a) ?? (weekly && (fallback & 1) ? "legacy-fallback" : null),
        opp: catalogAtEnd.get(b) ?? (weekly && (fallback & 2) ? "legacy-fallback" : null)
      }));
    }
    const cells = windowCells(k - 7, k, k);
    const deckBias = new Map(), pairBias = [], eligibleBias = [];
    for (const row of biasRows.filter(r => r[0] === k)) {
      const [, aIndex, bIndex, kind, contributors, pilots, topContributorShare, userEqualWinRate, withoutLargestWinRate, upperContributors, upperPilots] = row;
      const a = map.get(aIndex), b = map.get(bIndex);
      if (!a || (bIndex && !b)) throw Error("Cutoff catalog disagrees with bias cohort");
      const key = b ? a + "::" + b : a;
      const stats = { contributors, pilots, topContributorShare, userEqualWinRate, withoutLargestWinRate, upperContributors, upperPilots };
      if (kind === "p") pairBias.push({ a, b, ...stats });
      else if (kind === "d") deckBias.set(a, stats);
      else {
        const extra = extraBias.get(JSON.stringify([k, aIndex, bIndex, kind]));
        if (!extra) throw Error("Missing matched-population bias export for a cutoff");
        eligibleBias.push({ key, ...stats, withoutLargestWinRate: extra[0], otherRankContributors: extra[1] });
      }
    }
    const decks = [...map].filter(([, id]) => deckBias.has(id)).map(([i, deckId]) => {
      const [, , name, className, isOther] = catalogById.get(i);
      return { deckId, name, className, isOther, ...deckBias.get(deckId) };
    });
    const source = { environmentId, environmentName, asOf, environmentStart: exactStart || midnight(start, 0),
      periodStart: midnight(start, Math.max(0, k - 7)), shortPeriodStart: midnight(start, Math.max(0, k - 3)),
      contributors: totalUsers.get(k) || 0, cells, decks, pairBias, eligibleBias };
    const review = buildReviewSnapshotV2(source, "backtest-" + envNo + "-" + k);
    const weekly = buildWeeklyReportFromAggregates({ version: 1,
      current: grouped(windowCells(k - 7, k, k, true)), previous: grouped(windowCells(k - 14, k - 7, k, true)) },
      decks.map(d => ({ id: d.deckId, name: d.name, class_name: d.className })),
      buildWeeklyPeriod(dateLabel(start, k - 7), dateLabel(start, k - 1)));
    const bt = new Map(weekly.tierCandidates.map(r => [r.deckId, Number(r.suggestedTier.match(/\d/)?.[0]) || null]));
    const weeklyDecks = new Map(weekly.tierCandidates.map(r => [r.deckId, r]));
    const bp = new Map(weekly.unifiedMatchups.map(p => [p.deckAId + "::" + p.deckBId, p]));
    const futures = {};
    for (const h of [3, 7]) {
      if (midnight(start, k + h) > midnight(closedThrough, 0) || (end && Date.parse(midnight(start, k + h)) > Date.parse(end))) continue;
      const nextCells=windowCells(k,k+h,k+h);
      const encounters=new Map();
      for(const c of nextCells) encounters.set(c.opp,(encounters.get(c.opp)??0)+c.total);
      const fc = nextCells.filter(c => c.my && c.opp && c.my !== c.opp && !others.has(c.my) && !others.has(c.opp));
      const period = grouped(fc);
      futures[h] = { encounters, total:nextCells.reduce((total,c)=>total+c.total,0), deck: periodDeckPerspectives(period, true), pair: periodUnifiedCounts(period) };
    }
    function future(key, pair) {
      return Object.fromEntries(Object.entries(futures).map(([h, f]) => {
        const r = pair ? f.pair.get(key) : f.deck.get(key)?.combined;
        return [h, pair ? [r?.deckAWins || 0, r?.totalMatches || 0] : [r?.wins || 0, r?.matches || 0]];
      }));
    }
    const deckRows = review.decks.filter(d => !d.isOther && d.registrations > 0).map(d => ({
      encounters:d.encounters,encounterRate:d.encounterRate,recentEncounters:d.short.encounters,
      futureEncounters:Object.fromEntries(Object.entries(futures).map(([h,f])=>[h,[f.encounters.get(d.deckId)??0,f.total]])),
      name: d.name, id: d.deckId, n: d.eligibleCount, rate: d.eligibleWinRate, effective: d.model.effectiveRate,
      coverage: d.model.coverage, bias: d.model.bias, confidence: d.model.measuredConfidence, signals: d.model.signals.map(s => s.kind),
      interval: d.interval95, direct: d.model.direct, reversed: d.model.reversed, short: d.model.short, upper: d.model.upper,
      estimated: d.model.estimatedRate, major: d.model.majorMatchups, weeklyScore: weeklyDecks.get(d.deckId)?.strengthScore ?? null,
      A: d.model.legacyTier, B: bt.get(d.deckId) ?? null, C: d.model.candidateTier, future: future(d.deckId, false)
    }));
    const names = new Map(decks.map(d => [d.deckId, d.name]));
    const pairRows = review.pairs.filter(p => !others.has(p.a) && !others.has(p.b)).map(p => {
      const id = p.a + "::" + p.b, weeklyPair = bp.get(id);
      let weeklyDirection = null;
      // Weekly publishes a directional edge only at 10 matches and inclusive 55%.
      if (weeklyPair?.totalMatches >= 10 && weekly.correlation.some(e => e.advantagedDeck === names.get(p.a) && e.disadvantagedDeck === names.get(p.b) && weeklyPair.deckAWinRate >= 55)) weeklyDirection = 1;
      if (weeklyPair?.totalMatches >= 10 && weekly.correlation.some(e => e.advantagedDeck === names.get(p.b) && e.disadvantagedDeck === names.get(p.a) && weeklyPair.deckBWinRate >= 55)) weeklyDirection = -1;
      return { id, a: names.get(p.a), b: names.get(p.b), n: p.count, wins: p.wins, rate: p.winRate, effective: p.model.estimatedRate, interval: p.interval95,
        A: p.model.legacyRating, B: weeklyDirection, C: p.model.candidateRating, confidence: p.model.measuredConfidence, future: future(id, true) };
    });
    results.push({ envNo, environmentName, start, k, date, matches: review.matchCount, shortMatches:review.shortMatchCount, contributors: source.contributors, decks: deckRows, pairs: pairRows });
  }
}
fs.writeFileSync(output, JSON.stringify(results));
