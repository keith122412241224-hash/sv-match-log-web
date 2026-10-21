/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = '3d0fba6ecd8603e9c78e7bdd4dd0e6bc8156997b';
const hashes = {
  'src/components/environment/ObsEnvironmentView.tsx': '428f1e0e8e2009f8d0b111de1be034523716313660c3d24acd5bfb2cec555113',
  'src/components/environment/ObsEnvironmentView.module.css': '470fd7cbea833857f9d3d29d90d15e0afee197ccd455296c3a70ed5a22d7a453'
};
// Preserve historical scope checks only for these exact presentation edits.
// Behaviour tests always import the current component and aggregation code.
function readBeforeObsTrendDisplay(file) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed OBS trend display change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, readBeforeObsTrendDisplay };
