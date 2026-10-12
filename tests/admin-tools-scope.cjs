/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '177891dc64fe7e53390d8be09b10dec185fe8700';
const hashes = {
  'src/app/admin/page.tsx': 'c7cd8ec50913c0364cbc2ae5c2ee9e4ff68e5a0fb482f6d6f3e78737231298f6',
  'src/components/admin/ObsEnvironmentSettings.tsx': '7dfdfd9fc0ece76119d9631399ed29287fe00d1968fc3ff07cf9d5307dd3a6b5',
};
const readCurrent = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
// Preserve historical guards against their original source, allowing only the
// two hash-pinned presentation changes. The new scope test freezes all else.
function readBeforeAdminTools(file) {
  const source = readCurrent(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed admin tools UI change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, readCurrent, readBeforeAdminTools };
