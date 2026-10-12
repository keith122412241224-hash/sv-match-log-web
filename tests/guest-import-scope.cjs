/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = 'ba5889e62fc27fb229d1542a855248236ce7268c';
const hashes = require('./fixtures/guest-import-source-hashes.json');
const added = new Set(['supabase/migrations/20261012052435_guest_match_import_identity.sql']);
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
// Keep historical feature guards and their existing failures unchanged. Only
// these reviewed, hash-pinned changes project to the pre-fix source.
function readBeforeGuestImport(file) {
  const source = read(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed guest import change: ' + file);
  assert.ok(!added.has(file), 'new migration has no historical source');
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, added, read, readBeforeGuestImport };
