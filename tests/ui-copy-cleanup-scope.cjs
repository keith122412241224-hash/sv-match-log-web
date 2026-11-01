/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '50dcc9de7d62c3b0354b613ba89e308242b49ce7';
const hashes = {
  'src/components/analysis/AnalysisFilterPanel.tsx': '8769a6a1bdae8c04bb2273f6ca6546d4d9180a19d78b20007e242ecd54215e20',
  'src/components/environment/EnvironmentData.tsx': 'de501a244cbd805ffe2ef6b9c0dfdcde3726f2dedd023d28f94ba2ff78438ae1'
};
// Only historical byte guards see the old presentation, after validating the
// exact reviewed UI changes. Rendering, browser and behavior tests use live code.
function readBeforeUiCopy(file) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed UI copy change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
function excludeReviewedUiCopyChanges(files) {
  return files.filter(file => {
    if (!Object.hasOwn(hashes, file)) return true;
    readBeforeUiCopy(file);
    return false;
  });
}
module.exports = { readBeforeUiCopy, excludeReviewedUiCopyChanges };
