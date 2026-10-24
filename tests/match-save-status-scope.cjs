/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '109e9fc366cb6a66648b7e421a2bebca1b709a79';
const hashes = require('./fixtures/match-save-status-source-hashes.json');
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
// Historical byte guards still check their original implementation, but only
// after verifying this exact presentation patch. Runtime tests use live code.
function readBeforeSaveStatus(file) {
  const source = read(file);
  if (!Object.hasOwn(hashes, file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed save status change: ' + file);
  return git('show', base + ':' + file);
}
module.exports = { base, hashes, readBeforeSaveStatus, git };
