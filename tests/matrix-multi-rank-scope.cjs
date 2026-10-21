/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = 'a2d9f71ac946754e91e136536fbf8fc5ceb653bf';
const hashes = {
  'src/app/matrix/page.tsx': 'd7642e404890d95999a34ac781d652c32e4d55ab6ecd3d5704a96f1ab764b122',
  'src/components/matrix/MatrixFilters.tsx': '0c9cd64192b43ad1f95392db13dce9876277223353bcdbe416ba0e12948dd74c',
  'src/components/environment/EnvironmentFilters.tsx': 'af944681c57d21417a528c8caedb5bed1245714d59c802f48f5ef33f9c289804',
  'src/lib/matchup-data.ts': '761c9c30b8aa4ad35ee8bbdbadbc0b997c32c9f43543a3999e9318d1932c75d1'
};
// Historical scope checks see their reviewed baseline only for these pinned edits.
// Behaviour and SQL/browser tests execute the current production modules directly.
function readBeforeMatrixMultiRank(file) {
  const source = require('./member-matrix-scope.cjs').readBeforeMemberMatrix(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed matrix multi-rank change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, readBeforeMatrixMultiRank };
