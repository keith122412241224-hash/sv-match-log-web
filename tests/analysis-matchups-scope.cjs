/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='504a05ed275e3c78ccd326b3a58596b978d77c88';
const hashes=require('./fixtures/analysis-matchups-source-hashes.json');
const added=new Set(['src/components/analysis/AnalysisMatchups.tsx','src/lib/analysis-matchups.ts']);
function assertReviewed(file){
 assert.ok(Object.hasOwn(hashes,file));let source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 if(file==='src/components/analysis/AnalysisDashboard.tsx'){
  const before=cp.execFileSync('git',['show','78c227779b45af86d2b3369a0bdd158472f86746:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
  const removed='        <ExportableAnalysisBlock title={winRateMode === "combined" ? "デッキ別の環境勝率" : "使用デッキ別の勝率"} filename="deck-winrate">\n'
   +'          <AnalysisWinRates combined={winRateMode === "combined"} rows={byMyDeck} />\n'
   +'        </ExportableAnalysisBlock>\n\n';
  assert.equal(before.split(removed).length,2);
  assert.equal(source,before.replace(removed,'').replace('import { AnalysisWinRates } from "@/components/analysis/AnalysisWinRates";\n','').replace('registeredMatches, byMyDeck, matrix, summaries','registeredMatches, matrix, summaries'),'only the redundant deck-winrate section and unused bindings may be removed');
  source=before;
 }
 if(file==='src/components/analysis/AnalysisMatchups.tsx'){
  assert.equal(createHash('sha256').update(source).digest('hex'),'8009a54c121f7ffc5757191863b91809ce2f61506d581dd82ab16c870b5398e9','unreviewed matchup presentation and minimum-count controls');
  source=cp.execFileSync('git',['show','4cbb5d73d756c7c17e7dacd4a145511ce7c7f031:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
  const before=cp.execFileSync('git',['show','f6d97a7cba78c7387f6d4e31a50949f1113cda8f:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
  const removed='                  {cell.isLowSample ? <span className="block text-xs font-normal text-muted">少数データ</span> : null}\n';
  assert.equal(before.split(removed).length,2);
  assert.equal(source,before.replace(removed,''),'only the matchup low-sample label may be removed');
  source=before;
 }
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed matchup presentation: '+file);
}
// Only historical byte guards receive this projection. Runtime tests use live source.
function readBeforeMatchups(file){
 if(!Object.hasOwn(hashes,file))return fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 assertReviewed(file);assert.ok(!added.has(file));
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,assertReviewed,readBeforeMatchups};
