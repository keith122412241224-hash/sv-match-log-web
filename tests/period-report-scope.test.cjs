/* eslint-disable @typescript-eslint/no-require-imports */
const { legacySourcePath } = require('./legacy-source.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),ts=require('typescript');
const base='e430a568dedd847aa38e34b90c7a45e9a63752c8';
const git=args=>cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...args],{encoding:'utf8'});
const normalized=s=>s.replaceAll('\r\n','\n');
const original=file=>normalized(git(['show',base+':'+file]));
const read=file=>normalized(fs.readFileSync(legacySourcePath(file),'utf8'));
test('frozen oracle, shared evaluation, UI, Phase 2-A/B and unrelated loaders stay Production',()=>{
  assert.equal(read('tests/fixtures/weekly-report-e430a56.ts'),original('src/lib/weekly-report.ts'));
  const protectedFiles=git(['ls-tree','-r','--name-only',base]).split('\n').filter(file=>
    /^src\/(app\/(analysis|matrix|admin\/weekly-report)\/|lib\/(analysis-|matchup-|match-perspectives|analytics|weekly-report-config)|components\/admin\/WeeklyReport)/.test(file)
    ||file.startsWith('supabase/')||['package.json','package-lock.json'].includes(file));
  // R3-A/B intentionally adapt analysis/matrix entry points. v1 SQL,
  // aggregation models and all other protected files remain frozen.
  // R4 changes only period entry points; period-report-rank.test.cjs protects all other source.
  const rankEntryPoints = new Set(["src/app/admin/weekly-report/page.tsx","src/components/admin/WeeklyReportClientTools.tsx","src/lib/data.ts","src/lib/period-report-data.ts",'src/app/matrix/page.tsx', 'src/lib/matchup-data.ts', 'src/app/analysis/page.tsx', 'src/lib/analysis-data.ts']);
  for(const file of protectedFiles.filter(file => !rankEntryPoints.has(file)))assert.equal(read(file),original(file),file);
  const functions=source=>{
    const tree=ts.createSourceFile('file.ts',source,ts.ScriptTarget.Latest,true),result=new Map();
    for(const node of tree.statements)if(ts.isFunctionDeclaration(node)&&node.name)result.set(node.name.text,node.getText(tree));
    return result;
  };
  // R2 intentionally adds rank validation/payloads to two write paths only.
  const oldActions=functions(original('src/app/actions.ts')),newActions=functions(read('src/app/actions.ts'));
  assert.deepEqual([...newActions.keys()],[...oldActions.keys()]);
  for(const [name,body]of oldActions)if(!['saveMatchFromForm','importGuestMatches'].includes(name))
    assert.equal(newActions.get(name),body,'unchanged action helper '+name);
  const oldFunctions=functions(original('src/lib/weekly-report.ts')),newFunctions=functions(read('src/lib/weekly-report.ts'));
  const adapted=new Set(['buildWeeklyReport','buildOpponentDeckRanking','buildMyDeckWinRates','buildUnifiedMatchups','countUnifiedMatchups']);
  for(const [name,body]of oldFunctions)if(!adapted.has(name))assert.equal(newFunctions.get(name),body,'unchanged evaluation function '+name);
  const stripReport=s=>s.replace(/import .*period-report-rank.*\n/g,'').replace(/import .*analysis-rank-filter.*\n/g,'').replace(/import .*period-report-data.*\n/g,'').replace(/import .*weekly-report";\n/g,'')
    .replace(/const WEEKLY_REPORT_MATCH_COLUMNS = .*\n/g,'').replace(/export async function getWeeklyReport\([\s\S]*?(?=export const getIsAdmin)/,'');
  assert.equal(stripReport(read('src/lib/data.ts')),stripReport(original('src/lib/data.ts')),'all non-period data paths');
  const migration=read('supabase/legacy-migrations/pre-baseline/014_period_report_aggregates_v1.sql').replace(/--[^\n]*/g,'');
  assert.doesNotMatch(migration,/\b(create\s+(?:table|index|policy|type)|alter\s+(?:table|policy)|drop|insert|update|delete|truncate)\b/i);
  assert.equal((migration.match(/create or replace function/g)||[]).length,1);
  assert.ok(path.resolve('node_modules'));
});
