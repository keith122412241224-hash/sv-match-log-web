/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), cp = require('node:child_process');
const { base, removed, readBeforeRouteLoading } = require('./route-loading-scope.cjs');
test('route loading UX changes only the two fallbacks and exact Toast/Indicator positioning; all data, timers and prefetch remain unchanged', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n')
    .filter(file => /^(src|supabase)\//.test(file) || /^package(-lock)?\.json$/.test(file));
  for (const file of files) assert.equal(readBeforeRouteLoading(file), git(['show', base+':'+file]), file);
  for (const dir of ['src', 'supabase']) {
    const actual = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', dir]).trim().split('\n')
      .filter(file => fs.existsSync(file) && !require('./environment-dashboard-v3-scope.cjs').added.has(file) && !require('./period-report-environment-scope.cjs').added.has(file)).sort();
    assert.deepEqual(actual, files.filter(f => f.startsWith(dir+'/') && !removed.has(f)).sort(), 'no new production files: '+dir);
  }
});
