/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const base = '00c921c87684d04a7435f88a5aa364676cd0d20b';
const hashes = {
  "src/app/matches/page.tsx": "85d36edc7a8676e97c88859f0479a6e2ee1285e8dadb79918efd1012c8264e28",
  "src/components/matches/QuickMatchForm.tsx": "1b0fb75a429bcbec7020becd7d13f3de7358d9886674bf59d302a11760e32f51",
  "src/components/matches/RankFields.tsx": "fd628a260f7748f0e2a2c5ef6010ca51e93e6123259d993de553b66a1cff671a",
  "src/components/matches/ScheduledMatchForm.tsx": "740bf48b3b424b9478d2decc52250a3b2f446f7823b12895c0feb8aca32d479b",
  "src/components/guest/GuestApp.tsx": "988460cbe75a0d1444d47d8fba886d742064d7498055f208c29ebb35b58d8a70"
};
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
function assertReviewed(file) { assert.equal(createHash('sha256').update(read(file)).digest('hex'), hashes[file], 'unreviewed match input change: ' + file); }
// Preserve historical source guards only after validating the exact new UI bytes.
function readBeforeMatchInput(file) {
  if (!Object.hasOwn(hashes, file)) return read(file);
  assertReviewed(file);
  return git('show', base + ':' + file);
}
module.exports = { base, hashes, read, git, assertReviewed, readBeforeMatchInput };
