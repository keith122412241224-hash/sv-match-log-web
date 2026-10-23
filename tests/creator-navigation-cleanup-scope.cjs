/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = '550ad80970479d57a2f78a01c5b2ee23aedf81d0';
const hashes = {
  'src/app/admin/creator/page.tsx': '96696e868f65a4bc0b36b8f753e6b09216c23fff21c63a61217b627e332856db',
  'src/components/creator/TierEditor.tsx': 'b17297663d1e335b408b002cdbfd543269124fb668b8e0832b129d6bd754d67b',
  'src/components/creator/CorrelationList.tsx': '43258f7953b42e0c90bf572960f7b06393c2e5ef229350edf1aa352270de01e3',
  'src/components/creator/ObsSetEditor.tsx': '9367efd229f62a7fd9d9c8c350e34e24a6f875312b7b6968cd7a2cb2f1ee3b7d'
};
const read = file => require('./obs-unified-scope.cjs').readBeforeUnified(file);
function assertReviewed(file) { assert.ok(Object.hasOwn(hashes, file)); assert.equal(createHash('sha256').update(read(file)).digest('hex'), hashes[file], 'unreviewed creator navigation change: ' + file); }
// Historical scope checks retain their exact byte expectations after verifying
// all current navigation changes. Runtime/browser tests use current source.
function readBeforeCleanup(file) {
  if (!Object.hasOwn(hashes, file)) return read(file);
  assertReviewed(file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, read, assertReviewed, readBeforeCleanup };
