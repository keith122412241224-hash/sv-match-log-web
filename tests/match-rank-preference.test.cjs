/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankFromSelection, rankToSelection, lastRankKey, readLastRank, rememberLastRank } = require('../src/lib/match-rank-preference');
const { RANK_ATOMS } = require('../src/lib/rank-selection');
const { EMPTY_RANK, validateMatchRank } = require('../src/lib/match-rank');

test('all 17 atomic input values round trip through the existing DB contract', () => {
  for (const value of RANK_ATOMS) {
    const rank = rankFromSelection(value);
    assert.equal(validateMatchRank(rank).ok, true);
    assert.equal(rankToSelection(rank), value);
  }
  assert.deepEqual(rankFromSelection('master:sapphire'), { rank_tier: 'master', master_group: 'sapphire', grandmaster_rating: null });
  assert.deepEqual(rankFromSelection('grandmaster:none'), { rank_tier: 'grandmaster', master_group: null, grandmaster_rating: 'none' });
  assert.deepEqual(rankFromSelection('unranked'), EMPTY_RANK);
});
test('unknown, JSON, old schemas, incomplete parents and cross-rank combinations fall back to NULL', () => {
  for (const value of [null, undefined, {}, [], '', 'Master', 'master', 'grandmaster', 'master-plus', 'grandmaster-plus', 'master:epic', 'grandmaster:ruby', 'grandmaster:epic:ruby', 'aa:ruby', '{broken', '{"version":0,"rank":"aa"}', '{"rank_tier":"master","master_group":"ruby"}']) {
    assert.deepEqual(rankFromSelection(value), EMPTY_RANK, String(value));
  }
});
test('authenticated A/B and guest keys never overlap; missing identity does not use shared storage', () => {
  assert.equal(lastRankKey(), null);
  assert.notEqual(lastRankKey('A'), lastRankKey('B'));
  assert.notEqual(lastRankKey('guest'), lastRankKey(undefined, true));
  assert.equal(lastRankKey('A', true), lastRankKey('B', true));
});
test('preferences retain NULL, isolate users and tolerate storage read/write failures', () => {
  const data = new Map();
  global.window = { localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
  try {
    rememberLastRank(lastRankKey('A'), rankFromSelection('grandmaster:epic'));
    rememberLastRank(lastRankKey('B'), rankFromSelection('master:ruby'));
    assert.equal(rankToSelection(readLastRank(lastRankKey('A'))), 'grandmaster:epic');
    assert.equal(rankToSelection(readLastRank(lastRankKey('B'))), 'master:ruby');
    rememberLastRank(lastRankKey('A'), EMPTY_RANK);
    assert.deepEqual(readLastRank(lastRankKey('A')), EMPTY_RANK);
    window.localStorage.getItem = () => { throw new Error('denied'); };
    window.localStorage.setItem = () => { throw new Error('quota'); };
    assert.deepEqual(readLastRank(lastRankKey('A')), EMPTY_RANK);
    assert.doesNotThrow(() => rememberLastRank(lastRankKey('A'), EMPTY_RANK));
  } finally { delete global.window; }
});
