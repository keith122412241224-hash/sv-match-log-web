/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const { base, hashes, readBeforeAdminTools } = require('./admin-tools-scope.cjs');
test('admin tools changes only two reviewed UI files; all routes, auth, queries, aggregates, SQL and dependencies stay byte-identical', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  assert.deepEqual(Object.keys(hashes).sort(), ['src/app/admin/page.tsx', 'src/components/admin/ObsEnvironmentSettings.tsx']);
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) assert.equal(readBeforeAdminTools(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').filter(f => !require('./guest-import-scope.cjs').added.has(f)).sort(), files.filter(f => /^(src|supabase)\//.test(f)).sort());
});
