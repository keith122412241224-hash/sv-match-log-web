/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const scope = require('./admin-tools-cleanup-scope.cjs');

test('admin cleanup changes presentation only; report, OBS, auth, all other product code and migrations remain intact', () => {
  scope.files.forEach(scope.assertReviewed);
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git('ls-tree', '-r', '--name-only', scope.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const f of files) if (!scope.files.includes(f)) assert.equal(scope.read(f), git('show', scope.base + ':' + f), f);
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...require('./analysis-matchups-scope.cjs').added].sort());
});
