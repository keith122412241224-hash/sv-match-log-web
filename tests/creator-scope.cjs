/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '71d9b43';
const hashes = require('./fixtures/creator-source-hashes.json');
const added = new Set([
  'src/app/admin/creator/page.tsx', 'src/app/admin/creator/tier/page.tsx',
  'src/app/admin/creator/api/route.ts', 'src/app/admin/creator/images/[id]/route.ts',
  'src/app/admin/obs/tier/[id]/page.tsx', 'src/components/creator/Creator.module.css',
  'src/components/creator/ImageLibrary.tsx', 'src/components/creator/TierArtwork.tsx',
  'src/components/creator/TierEditor.tsx', 'src/components/creator/TierPreview.tsx',
  'src/lib/creator/model.ts', 'src/lib/creator/png.ts', 'src/lib/creator/server.ts',
  'supabase/migrations/20261006025457_creator_tier_tools.sql', ...require('./correlation-scope.cjs').added
]);
function readBeforeCreator(file) {
  const source = require('./correlation-scope.cjs').readBeforeCorrelation(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed creator change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, added, readBeforeCreator };
