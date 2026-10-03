/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process'), { createHash } = require('node:crypto');
const { base, hashes, changed, added, read, readBeforeObs } = require('./obs-environment-scope.cjs');
test('OBS changes only reviewed admin presentation; existing actions, normal pages, SQL/RPC/RLS, aggregation and dependencies are byte-identical', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  assert.deepEqual(Object.keys(hashes).sort(), [...changed, ...added].sort());
  for (const file of Object.keys(hashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'), hashes[file], file);
  for (const file of files) assert.equal(readBeforeObs(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...added].sort());
});
