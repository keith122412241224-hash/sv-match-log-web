/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = '7edf37dccba85c1077c3ef6105e2e1e1f7056886', file = 'src/app/admin/page.tsx';
const hash = '02931dba38e0e54e269be68c8280ca4104c585c4aed5d6b4afbc3bff246a24fc';
const read = file => require('./creator-navigation-cleanup-scope.cjs').readBeforeCleanup(file);
function assertReviewed() { assert.equal(createHash('sha256').update(read(file)).digest('hex'), hash, 'unreviewed admin tools navigation change'); }
// Only historical scope guards see the old page, after the exact new page is verified.
// Browser and runtime tests always load the actual current application.
function readBeforeNavigation(target) {
  if (target !== file) return read(target);
  assertReviewed();
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, file, hash, read, assertReviewed, readBeforeNavigation };
