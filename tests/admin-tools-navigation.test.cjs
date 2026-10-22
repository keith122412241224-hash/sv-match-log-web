/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const scope = require('./admin-tools-navigation-scope.cjs');
test('admin navigation changes only the reviewed Creator entrance; auth, tabs, report, OBS settings and every other product file remain exact', () => {
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  scope.assertReviewed();
  const before = scope.readBeforeNavigation(scope.file), after = scope.read(scope.file);
  const start = '        {section === "tools"', end = '          <section className="rounded-md border border-slate-200 bg-white p-4">';
  assert.equal(after.slice(0, after.indexOf(start)), before.slice(0, before.indexOf(start)));
  assert.equal(after.slice(after.indexOf(end, after.indexOf(start))), before.slice(before.indexOf(end, before.indexOf(start))));
  assert.deepEqual(git('diff', scope.base, '--name-only', '--', 'src', 'supabase', 'package.json', 'package-lock.json').trim().split('\n'), [scope.file]);
  const tracked = git('ls-tree', '-r', '--name-only', scope.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f));
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), tracked.sort());
});
