/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { base, hashes, added, read, readBeforeMatchMutations } = require('./match-mutations-scope.cjs');
test('match mutations preserve all existing RPCs, RLS, schema, aggregate code and dependencies', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of Object.keys(hashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'), hashes[file], file);
  for (const file of files) assert.equal(readBeforeMatchMutations(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...added].sort());
});
