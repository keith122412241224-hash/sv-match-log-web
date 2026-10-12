/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { base, hashes, added, read, readBeforeGuestImport } = require('./guest-import-scope.cjs');
test('guest import changes only its action, type and additive migration; all previous SQL and unrelated features preserved', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  assert.deepEqual(Object.keys(hashes).sort(), ['src/app/actions.ts', 'src/types/database.ts', ...added].sort());
  for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'), hash, file);
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) assert.equal(readBeforeGuestImport(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...added].sort());
});
