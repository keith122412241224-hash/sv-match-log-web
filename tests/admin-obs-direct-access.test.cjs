/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const scope = require('./admin-obs-direct-access-scope.cjs');
test('direct environment OBS restores only existing settings and preserves every other product file and migration', () => {
  scope.assertReviewed();
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git('ls-tree', '-r', '--name-only', scope.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const f of files) if (f !== scope.file) assert.equal(scope.read(f), git('show', scope.base + ':' + f), f);
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...require('./analysis-matchups-scope.cjs').added].sort());
});
