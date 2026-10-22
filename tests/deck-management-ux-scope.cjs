/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = 'd4f1f376f495cf6a11ae3d1ea0278dc93548da58';
const selection = require('./deck-select-dialog-scope.cjs');
const multi = require('./analysis-deck-multi-scope.cjs');
const hashes = { ...selection.hashes, ...multi.hashes, 'src/app/decks/page.tsx': '4c76033236bd7353a2de1c740c1e976a207a20ae95cf58b144f0f131cd266ab2' };
function assertReviewed(file) {
  if (Object.hasOwn(multi.hashes,file)) return multi.assertReviewed(file);
  if (Object.hasOwn(selection.hashes, file)) return selection.assertReviewed(file);
  assert.equal(createHash('sha256').update(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hashes[file], 'unreviewed deck management change: ' + file);
}
// Historical scope guards project only these exact UI bytes. Behaviour tests use current modules.
function readBeforeDeckManagement(file) {
  const source = selection.readBeforeDeckSelect(file);
  if (file !== 'src/app/decks/page.tsx') return source;
  assertReviewed(file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, assertReviewed, readBeforeDeckManagement };
