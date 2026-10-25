/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const base = '38700ea59435c0d3a0e07a5dd44bca0f70ddc078';
const dashboard = 'src/components/analysis/AnalysisDashboard.tsx';
const removed = '        <ExportableAnalysisBlock title="先攻/後攻別の勝率" filename="turn-order-winrate">\n'
  + '          <AnalysisWinRates combined={winRateMode === "combined"} rows={byTurn} turns />\n'
  + '        </ExportableAnalysisBlock>\n\n';
// Historical guards accept only the exact section and unused binding removal.
// Browser and behaviour tests continue to execute the current source.
function readBeforeTurnSection(file) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (file !== dashboard) return source;
  const before = cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
  assert.equal(before.split(removed).length, 2);
  assert.equal(source, before.replace(removed, '').replace('byOpponentDeck, byTurn, matrix', 'byOpponentDeck, matrix'), 'only the standalone turn section and unused binding may change');
  return before;
}
module.exports = { dashboard, readBeforeTurnSection };
