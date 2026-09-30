/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process'), ts = require('typescript');
const production = '71b9f3d9190c7108a50b84a02c0dcdeef006d3b1';
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const git = (file, revision = production) => cp.execFileSync('git', ['show', revision + ':' + file], { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
const parse = code => ts.createSourceFile('scope.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = (tree, name) => tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
function tokens(code) {
  const tree = parse(code), result = [];
  assert.equal(tree.parseDiagnostics.length, 0, 'source guard parses valid TSX');
  function visit(node) {
    const children = node.getChildren(tree);
    if (children.length) { children.forEach(visit); return; }
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const value = ts.isJsxText(node) ? node.text.trim() : node.text ?? node.getText(tree);
    if (ts.isJsxText(node) && !value) return;
    result.push([node.kind, value]);
  }
  visit(tree);
  return result;
}
const same = (actual, expected, label) => assert.deepEqual(tokens(actual), tokens(expected), label);

// The historical tests intentionally retain their older baselines. Before projecting
// the split back into that layout, verify the relocated server and display bodies.
// This keeps pre-existing failures intact; it does not exempt analysis from inspection.
exports.analysisBeforeSplit = () => {
  const before = git('src/app/analysis/page.tsx'), oldTree = parse(before), oldPage = fn(oldTree, 'AnalysisPage');
  const loaderSource = read('src/lib/analysis-page-data.ts'), loaderTree = parse(loaderSource), loader = fn(loaderTree, 'getAnalysisPageData');
  const clientSource = read('src/components/analysis/AnalysisDashboard.tsx'), clientTree = parse(clientSource), client = fn(clientTree, 'AnalysisDashboard');
  const pageSource = read('src/app/analysis/page.tsx');
  const splitRevision = 'd55273b2579bd0e48214fed871f0b7192445d9a4';
  const imports = source => parse(source).statements.filter(ts.isImportDeclaration).map(n => n.getText()).join('\n');
  same(imports(loaderSource), imports(git('src/lib/analysis-page-data.ts', splitRevision)), 'server dependencies remain server-owned');
  same(imports(clientSource), imports(git('src/components/analysis/AnalysisDashboard.tsx', splitRevision)).replace('useEffect,', 'useEffect, useLayoutEffect,'), 'client dependencies do not acquire server/data access');
  const oldEntry = git('src/app/analysis/page.tsx', splitRevision);
  const expectedEntry = oldEntry.replace('  return <AppShell><AnalysisDashboard', '  const initialQuery = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();\n  return <AppShell><AnalysisDashboard')
    .replace('initialData={await getAnalysisPageData(params)} />', 'initialData={await getAnalysisPageData(params)} initialQuery={initialQuery} />');
  same(pageSource, expectedEntry, 'server entry retains validation, AppShell and one loader invocation');
  for (const name of ['normalizeDatetimeLocal', 'toJstIso']) same(fn(loaderTree, name).getText(loaderTree), fn(oldTree, name).getText(oldTree), name);
  const statements = node => node.body.statements.map(s => s.getText());
  const original = statements(oldPage), moved = statements(loader);
  const scopeStart = original.findIndex(s => s.startsWith('const selectedScope'));
  const aggregateEnd = original.findIndex(s => s.startsWith('const aggregates'));
  const expected = [
    'const selectedRanks = parseRankSelection(params);',
    'const [environments, isAdmin] = await Promise.all([getEnvironments(), getIsAdmin()]);',
    ...original.slice(scopeStart, aggregateEnd + 1).map(s => s.replace(/\bselectedRank\b/g, 'selectedRanks'))
  ];
  same(moved.slice(0, expected.length).join('\n'), expected.join('\n'), 'all relocated server selection, scope, datetime and RPC arguments');
  // The remaining two statements only trim metadata and construct the client DTO.
  assert.equal(moved.length, expected.length + 2);
  same(moved[expected.length], 'const deckLabels = (items: typeof matrixDecks) => items.map(({ id, name, class_name }) => ({ id, name, class_name }));', 'metadata whitelist');
  same(moved.at(-1), `return { environments: environments.map(({ id, name }) => ({ id, name })), isAdmin, selectedRanks, selectedScope, winRateMode, selectedEnvironmentId,
    decks: deckLabels(decks), archetypes: deckLabels(archetypes), selectedEnvironmentName, matrixDecks: deckLabels(matrixDecks),
    selectedMyDeckId, selectedOpponentDeckId, selectedTurnOrder, selectedResult, selectedPlayedFrom, selectedPlayedTo, aggregates };`, 'complete DTO');
  same(loaderTree.statements.find(ts.isTypeAliasDeclaration).getText(), oldTree.statements.find(ts.isTypeAliasDeclaration).getText().replace('type AnalysisSearchParams', 'export type AnalysisSearchParams').replace('rank?: string;', 'rank?: string; ranks?: string;'), 'search parameter contract');
  const oldBuild = original.find(s => s.includes('= buildAnalysisFromAggregates('));
  same(statements(client).find(s => s.includes('= buildAnalysisFromAggregates(')), oldBuild, 'presentation uses the same aggregate builder');
  const oldReturn = oldPage.body.statements.find(ts.isReturnStatement).expression.expression;
  const oldDiv = oldReturn.children.find(ts.isJsxElement).getText();
  const expectedDiv = oldDiv.replace('<div className="grid gap-6">', '<div ref={container} className="grid gap-6">')
    .replace('canUseAllUsers={isAdmin}', 'canUseAllUsers={isAdmin} pending={pending} onRankApply={applyRanks}')
    .replace('...(selectedRank === "all" ? {} : { rankFilter: selectedRank })', 'rankSelection: selectedRanks')
    .replace('<p className="text-sm text-muted">\n          勝率集計:', `{pending && <p role="status" className="text-sm text-muted">ランク条件を適用中…</p>}
        {failed && <p role="alert" className="text-sm text-red-700">分析データを取得できませんでした。もう一度ランク条件を適用してください。</p>}
        <p className="text-sm text-muted">\n          勝率集計:`);
  same(client.body.statements.find(ts.isReturnStatement).expression.expression.getText(), expectedDiv, 'all cards, recent results, PNG blocks, tables and admin scope display');
  assert.match(clientSource, /^"use client";/);
  assert.doesNotMatch(pageSource, /["']use client["']/);
  assert.match(pageSource, /parseRankSelection\(params\)/);
  assert.match(pageSource, /<AppShell><AnalysisDashboard initialData=\{await getAnalysisPageData\(params\)\} initialQuery=\{initialQuery\} \/><\/AppShell>/);
  assert.match(pageSource, /new URLSearchParams\(Object.entries\(params\)/);
  for (const source of [loaderSource, clientSource, pageSource]) assert.doesNotMatch(source, /getMatches\(|\.from\(["']matches["']\)/);
  // Projection is allowed only after all moved Production logic above matches.
  return before;
};
