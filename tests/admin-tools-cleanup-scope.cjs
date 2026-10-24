/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict');
const base = '49730130ee4a0529ef3acee73e619097e5edd586';
const files = ['src/app/admin/page.tsx', 'src/components/admin/ObsEnvironmentSettings.tsx'];
const read = require('./environment-deck-data-scope.cjs').readBeforeDeckData;
const before = f => cp.execFileSync('git', ['show', base + ':' + f], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
function expected(f) {
  const source = before(f);
  if (f === files[0]) return source
    .replace('grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]', 'grid items-start gap-3')
    .replace('grid min-w-0 gap-3 lg:col-span-2 lg:grid-cols-3', 'grid min-w-0 gap-3 lg:grid-cols-3')
    .replace(/          <section[^\n]+\n            <h2[^\n]+>期間レポート<\/h2>\n[^\n]+\n[^\n]+\n          <\/section>\n/, '');
  assert.equal(f, files[1]);
  return source.replace('>環境データOBS表示</h2>', '>環境データ</h2>')
    .replace(/    <details[^\n]+\n[\s\S]*?    <\/details>\n/, '');
}
function assertReviewed(f) { assert.equal(read(f), expected(f), 'only reviewed admin presentation changes are permitted: ' + f); }
// Historical scope assertions retain their original baselines; runtime/browser tests use current source.
function readBeforeCleanup(f) { if (!files.includes(f)) return read(f); assertReviewed(f); return before(f); }
module.exports = { base, files, read, assertReviewed, readBeforeCleanup };
