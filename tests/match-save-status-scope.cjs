/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '109e9fc366cb6a66648b7e421a2bebca1b709a79';
const hashes = require('./fixtures/match-save-status-source-hashes.json');
const collapsedDeckFile = 'src/components/DeckSelectDialog.tsx';
const read = require('./analysis-turn-section-scope.cjs').readBeforeTurnSection;
const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
// Historical byte guards still check their original implementation, but only
// after verifying this exact presentation patch. Runtime tests use live code.
function readBeforeSaveStatus(file) {
  const source = read(file);
  if (file === collapsedDeckFile) {
    // Accept only the requested initial-state line; keep every other byte pinned.
    const current = 'setExpanded([]); setOpen(true);';
    assert.equal(source.split(current).length, 2);
    const before = source.replace(current, 'setExpanded(selected ? [selected.class_name] : []); setOpen(true);');
    assert.equal(createHash('sha256').update(before).digest('hex'), '2d6a6567752634d438caa72f760fe56b62536608c786b56732ed292fda6cf650', 'unreviewed deck dialog change');
    return before;
  }
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed save status change: ' + file);
  return git('show', base + ':' + file);
}
module.exports = { base, hashes, collapsedDeckFile, readBeforeSaveStatus, git };
