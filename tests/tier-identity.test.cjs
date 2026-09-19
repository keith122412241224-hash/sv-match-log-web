/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
let state;
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'react') return { ...React, useMemo: fn => fn(), useState: initial => typeof initial === 'string' ? [initial, () => {}] : [state ?? initial, update => { state = typeof update === 'function' ? update(state ?? initial) : update; }] };
  return load.call(this, name, ...args);
};
const { buildWeeklyReport, buildWeeklyPeriod } = require('../src/lib/weekly-report');
const { WeeklyReportInteractiveSections } = require('../src/components/admin/WeeklyReportInteractiveSections');
const { WeeklyReportAiWorkspace } = require('../src/components/admin/WeeklyReportAiWorkspace');
const { WeeklyReportTables } = require('../src/components/admin/WeeklyReportViews');
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
for (const unknown of [false, true]) test(`A4: independent ${unknown ? 'unresolved' : 'same-name'} IDs across controls, PNG, JSON and prompt`, () => {
  state = undefined;
  const rows = Array.from({ length: 20 }, (_,i) => ({ id: String(i), my_deck_id: 'legacy-a', opponent_deck_id: 'b', my_archetype_id: 'a', opponent_archetype_id: null, result: i < 12 ? 'win' : 'lose', turn_order: 'first', played_at: '2026-09-03T00:00:00Z' }));
  const decks = unknown ? [] : ['a','b'].map(id => ({ id, name: '同名デッキ', class_name: 'エルフ' }));
  const report = buildWeeklyReport(rows, [], decks, buildWeeklyPeriod('2026-09-01','2026-09-07'));
  assert.deepEqual(new Set(report.aiJson.tierCandidates.map(row => row.deckId)), new Set(['a','b']));
  assert.equal(new Set(report.aiJson.tierCandidates.map(row => row.deckName)).size, 1);
  const input = { opponentRows: [], winRateRows: [], matchupRows: [], correlationRows: [], tierRows: report.tierCandidates, aiJson: report.aiJson, startDate: '2026-09-01', endDate: '2026-09-07', hasApiKey: false };
  let tree = WeeklyReportInteractiveSections(input);
  const workspace = nodes(tree).find(node => node.type === WeeklyReportAiWorkspace);
  const controls = nodes(WeeklyReportAiWorkspace(workspace.props)).filter(node => node.type === 'label');
  assert.deepEqual(controls.map(node => node.key), report.aiJson.tierCandidates.map(row => row.deckId));
  nodes(controls.find(node => node.key === 'a')).find(node => node.type === 'select').props.onChange({ target: { value: 'Tier2' } });
  assert.deepEqual(state, { a: 'Tier2' });
  tree = WeeklyReportInteractiveSections(input);
  const tableProps = nodes(tree).find(node => node.type === WeeklyReportTables).props;
  assert.equal(tableProps.tierRows.find(row => row.deckId === 'a').finalTier, 'Tier2');
  assert.deepEqual(tableProps.tierRows.find(row => row.deckId === 'b'), report.tierCandidates.find(row => row.deckId === 'b'));
  const exportBlock = nodes(WeeklyReportTables(tableProps)).find(node => node.props.fileName === 'period-tier-candidates.png');
  const tierTable = nodes(exportBlock).find(node => node.props.rows === tableProps.tierRows);
  const rendered = tierTable.type(tierTable.props);
  assert.equal(nodes(rendered).filter(node => ['a','b'].includes(node.key)).length, unknown ? 0 : 2);
  const adjusted = nodes(WeeklyReportAiWorkspace(nodes(tree).find(node => node.type === WeeklyReportAiWorkspace).props));
  const json = JSON.parse(adjusted.find(node => node.type === 'textarea' && node.props.readOnly).props.value);
  assert.equal(json.tierCandidates.find(row => row.deckId === 'a').finalTier, 'Tier2');
  assert.deepEqual(json.tierCandidates.find(row => row.deckId === 'b'), report.aiJson.tierCandidates.find(row => row.deckId === 'b'));
  const prompt = adjusted.find(node => node.props.label === 'AI用プロンプトをコピー').props.text;
  assert.ok(prompt.includes(JSON.stringify(json, null, 2)));
  assert.equal(adjusted.find(node => node.props.prompt).props.prompt, prompt);
});
