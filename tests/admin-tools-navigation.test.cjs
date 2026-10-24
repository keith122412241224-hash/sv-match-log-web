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
  const cleanup = require('./creator-navigation-cleanup-scope.cjs');
  const unified=require('./obs-unified-scope.cjs'); Object.keys(unified.hashes).forEach(unified.assertReviewed);
  const presentation = require('./admin-tools-cleanup-scope.cjs');
  const changes = git('diff', scope.base, '--name-only', '--', 'src', 'supabase', 'package.json', 'package-lock.json').trim().split('\n')
    .filter(f => !presentation.files.includes(f) || presentation.readBeforeCleanup(f) !== git('show', scope.base + ':' + f));
  assert.deepEqual(require('./environment-deck-data-scope.cjs').historicalChanges(changes, scope.base).filter(file => {
    if(Object.hasOwn(unified.hashes,file)&&file!==scope.file&&!Object.hasOwn(cleanup.hashes,file)){if(!unified.added.has(file))assert.equal(unified.readBeforeUnified(file),git('show',scope.base+':'+file));return false;}
    if (!Object.hasOwn(cleanup.hashes, file)) return true;
    cleanup.assertReviewed(file);
    assert.equal(cleanup.readBeforeCleanup(file), git('show', scope.base + ':' + file));
    return false;
  }), [scope.file]);
  const tracked = git('ls-tree', '-r', '--name-only', scope.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f));
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), [...tracked,...unified.added].sort());
});
