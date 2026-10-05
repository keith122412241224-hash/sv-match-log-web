/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '63fc73b73f186d75d921b42adb43200b8bcb9de2';
const hashes = require('./fixtures/match-mutations-source-hashes.json');
const added = new Set(['src/components/matches/MatchActions.tsx', 'src/lib/match-edit.ts']);
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
// Historical feature guards keep their old assertions. Only these reviewed,
// hash-pinned changes are projected back; the new scope test protects all else.
function readBeforeMatchMutations(file) {
  const source = read(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed match mutation change: ' + file);
  assert.ok(!added.has(file), 'new files have no historical source');
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, added, read, readBeforeMatchMutations };
