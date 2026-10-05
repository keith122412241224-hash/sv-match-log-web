/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const { loadIdentifiedGuestMatches, mutateGuestMatch } = require('../src/lib/guest-records.ts');
const { removeImportedGuestMatches } = require('../src/lib/guest-storage.ts');
const row = (id = 'one') => ({ local_id: id, environment_id: 'env', my_deck_id: 'a', opponent_deck_id: 'b', my_archetype_id: 'a', opponent_archetype_id: 'b', result: 'win', turn_order: 'first', played_at: '2026-10-01T00:00:00Z', extra: { preserved: true } });
function storage(rows) { return { raw: JSON.stringify(rows), getItem() { return this.raw; }, setItem(k, value) { this.raw = value; } }; }
test('Guest edits exactly one row, preserves identity/time/unknown fields and reloads the persisted result', () => {
  const s = storage([row(), row('two'), { unknown: true }]);
  const next = mutateGuestMatch(s, 'one', { ...row(), local_id: 'forged', played_at: '1900-01-01', user_id: 'forged', my_deck_id: 'b', opponent_deck_id: 'a', result: 'lose', turn_order: 'second', rank_tier: 'master', master_group: 'ruby' });
  assert.equal(next[0].result, 'lose'); assert.equal(next[0].local_id, 'one'); assert.equal(next[0].played_at, row().played_at);
  assert.equal(next[0].user_id, undefined); assert.deepEqual(next[0].extra, row().extra);
  assert.equal(next[0].master_group, 'ruby'); assert.deepEqual(next[1], row('two'));
  assert.deepEqual(loadIdentifiedGuestMatches(s).slice(0, 2), next);
  assert.equal(JSON.parse(s.raw)[2].unknown, true);
});
test('Guest hard delete survives reload and only edited, remaining records enter import', () => {
  const s = storage([row(), row('two')]);
  mutateGuestMatch(s, 'one', { ...row(), result: 'lose' });
  mutateGuestMatch(s, 'two');
  const submitted = s.raw;
  assert.deepEqual(loadIdentifiedGuestMatches(s).map(r => [r.local_id, r.result]), [['one', 'lose']]);
  assert.deepEqual(JSON.parse(removeImportedGuestMatches(s.raw, submitted, ['one', 'two'])), []);
});
test('Guest legacy/duplicate identities are persisted before actions become available', () => {
  const s = storage([{ ...row(), local_id: undefined }, row('duplicate'), row('duplicate'), 'unknown']);
  const loaded = loadIdentifiedGuestMatches(s);
  assert.equal(new Set(loaded.map(r => r.local_id)).size, 3);
  assert.deepEqual(loadIdentifiedGuestMatches(s), loaded);
  mutateGuestMatch(s, loaded[2].local_id); assert.equal(loadIdentifiedGuestMatches(s).length, 2);
  assert.equal(JSON.parse(s.raw).at(-1), 'unknown');
});
test('Guest rejects missing/ambiguous targets, invalid rank and storage failures without losing data', () => {
  for (const rows of [[], [row(), row()]]) {
    const s = storage(rows), original = s.raw;
    assert.throws(() => mutateGuestMatch(s, 'one')); assert.equal(s.raw, original);
  }
  const s = storage([row()]), original = s.raw;
  assert.throws(() => mutateGuestMatch(s, 'one', { ...row(), rank_tier: 'master', master_group: 'invalid' }));
  assert.equal(s.raw, original);
  s.setItem = () => { throw Error('quota'); };
  assert.throws(() => mutateGuestMatch(s, 'one')); assert.equal(s.raw, original);
  assert.throws(() => mutateGuestMatch(s, 'one', row())); assert.equal(s.raw, original);
  assert.throws(() => mutateGuestMatch({ getItem() { throw Error('denied'); } }, 'one'));
});
