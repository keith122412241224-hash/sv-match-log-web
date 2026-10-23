/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const scope = require('./creator-navigation-cleanup-scope.cjs');
test('creator navigation changes only four reviewed files; all other product, database and dependency files stay exact', () => {
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const unified=require('./obs-unified-scope.cjs'); Object.keys(unified.hashes).forEach(unified.assertReviewed);
  for (const file of Object.keys(scope.hashes)) scope.assertReviewed(file);
  assert.deepEqual(git('diff', scope.base, '--name-only', '--', 'src', 'supabase', 'package.json', 'package-lock.json').trim().split('\n').filter(f=>!Object.hasOwn(unified.hashes,f)||Object.hasOwn(scope.hashes,f)).sort(), Object.keys(scope.hashes).sort());
  const inventory = git('ls-tree', '-r', '--name-only', scope.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f));
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), [...inventory,...unified.added].sort());
  for (const file of Object.keys(scope.hashes).filter(f => f.startsWith('src/components/'))) {
    const before = scope.readBeforeCleanup(file), after = scope.read(file);
    const removeHeader = text => text.replace(/<header\b[\s\S]*?<\/header>/, '<header />');
    assert.equal(removeHeader(after), removeHeader(before), 'save/edit/PNG/OBS logic unchanged: ' + file);
  }
});
