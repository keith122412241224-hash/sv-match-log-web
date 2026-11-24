/* eslint-disable @typescript-eslint/no-require-imports */
// Exact, reviewable theme delta. Only historical source guards use this projection;
// runtime imports, browser tests and the current-scope test always use live files.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const environmentReview = require('./environment-review-scope.cjs');
const base = '3d9d12dca854ddd77051362f0ad6472ba8fb7dd4';
const normalize = text => text.replaceAll('\r\n', '\n');
const patch = normalize(fs.readFileSync(__dirname + '/fixtures/theme-source.patch', 'utf8'));
const changes = new Map(patch.split('diff --git ').slice(1).map(section => {
  const file = section.match(/^a\/(.*?) b\//)[1];
  return [file, { added: section.includes('\n--- /dev/null\n'), section }];
}));
const added = new Set([...changes].filter(([, change]) => change.added).map(([file]) => file));
const gitSource = (ref, file) => normalize(cp.execFileSync('git', ['show', ref + ':' + file], { encoding: 'utf8', maxBuffer: 16e6, windowsHide: true }));

// No fuzzy patching: every removed/context line and hunk count must match.
function applyExact(before, section) {
  const input = before ? before.split('\n').slice(0, -1) : [], output = [];
  assert.ok(!before || before.endsWith('\n'));
  let cursor = 0;
  const hunks = section.split(/(?=^@@ )/m).slice(1);
  assert.ok(hunks.length);
  for (const hunk of hunks) {
    const lines = hunk.split('\n'), header = lines.shift().match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    assert.ok(header);
    const oldCount = Number(header[2] ?? 1), newCount = Number(header[4] ?? 1);
    const start = Number(header[1]) - (oldCount ? 1 : 0);
    assert.ok(start >= cursor && start <= input.length);
    output.push(...input.slice(cursor, start)); cursor = start;
    assert.equal(output.length, Number(header[3]) - (newCount ? 1 : 0));
    let removed = 0, inserted = 0;
    for (const line of lines) {
      if (!line) continue;
      assert.ok([' ', '-', '+'].includes(line[0]), 'unsupported patch line');
      if (line[0] !== '+') { assert.equal(input[cursor++], line.slice(1), 'patch context'); removed++; }
      if (line[0] !== '-') { output.push(line.slice(1)); inserted++; }
    }
    assert.equal(removed, oldCount); assert.equal(inserted, newCount);
  }
  output.push(...input.slice(cursor));
  return output.join('\n') + '\n';
}
const expected = new Map();
const inventories = new Map();
function existsAt(ref, file) {
  if (!inventories.has(ref)) inventories.set(ref, new Set(cp.execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { encoding: 'utf8', maxBuffer: 16e6, windowsHide: true }).trim().split('\n')));
  return inventories.get(ref).has(file);
}
function reviewed(file) {
  assert.ok(changes.has(file), 'not a reviewed theme file: ' + file);
  if (!expected.has(file)) {
    const before = added.has(file) ? '' : gitSource(base, file);
    expected.set(file, { before, after: applyExact(before, changes.get(file).section) });
  }
  return expected.get(file);
}
function assertReviewed(file, source = fs.readFileSync(file, 'utf8')) {
  assert.equal(environmentReview.readBeforeReview(file, source), reviewed(file).after, 'unreviewed theme change: ' + file);
}
function readBeforeTheme(file) {
  const source = normalize(fs.readFileSync(file, 'utf8'));
  if (!changes.has(file)) return environmentReview.readBeforeReview(file, source);
  assertReviewed(file, source);
  assert.ok(!added.has(file), 'new theme files have no historical source');
  return reviewed(file).before;
}
function historicalFiles(files, ref) {
  // Every theme file is verified before excluding its reviewed delta. Unknown
  // files stay in the result, so existing inventory guards still reject them.
  for (const file of changes.keys()) assertReviewed(file);
  return environmentReview.historicalFiles(files, ref).filter(file => {
    if (added.has(file)) return false;
    if (!ref || !changes.has(file)) return true;
    // A file added by an older feature must still reach that feature's guard.
    if (!existsAt(ref, file)) return true;
    return reviewed(file).before !== gitSource(ref, file);
  });
}
module.exports = { base, changes, added, gitSource, applyExact, reviewed, assertReviewed, readBeforeTheme, historicalFiles };
