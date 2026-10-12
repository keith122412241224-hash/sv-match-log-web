/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = 'ba5889e62fc27fb229d1542a855248236ce7268c';
const hashes = require('./fixtures/guest-import-source-hashes.json');
// Later, independently tested permission-only migration. Keep the original
// Guest source hashes and its historical comparisons unchanged.
const laterAdded = new Set(['supabase/migrations/20261012075121_environment_admin_write_policies.sql', ...require('./normal-match-request-scope.cjs').added]);
const added = new Set(['supabase/migrations/20261012052435_guest_match_import_identity.sql', ...laterAdded]);
const read = file => require('./normal-match-request-scope.cjs').readBeforeNormalRequest(file);
// Keep historical feature guards and their existing failures unchanged. Only
// these reviewed, hash-pinned changes project to the pre-fix source.
function readBeforeGuestImport(file) {
  const source = read(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed guest import change: ' + file);
  assert.ok(!added.has(file), 'new migration has no historical source');
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, added, laterAdded, read, readBeforeGuestImport };
