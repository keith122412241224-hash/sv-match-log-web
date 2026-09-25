/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),ts=require('typescript');
const base='e430a568dedd847aa38e34b90c7a45e9a63752c8';
const git=args=>cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...args],{encoding:'utf8'});
const normalized=s=>s.replaceAll('\r\n','\n');
const original=file=>normalized(git(['show',base+':'+file]));
const read=file=>normalized(fs.readFileSync(file,'utf8'));
test('frozen oracle, shared evaluation, UI, Phase 2-A/B and unrelated loaders stay Production',()=>{
  assert.equal(read('tests/fixtures/weekly-report-e430a56.ts'),original('src/lib/weekly-report.ts'));
  const protectedFiles=git(['ls-tree','-r','--name-only',base]).split('\n').filter(file=>
    /^src\/(app\/(analysis|matrix|admin\/weekly-report)\/|lib\/(analysis-|matchup-|match-perspectives|analytics|weekly-report-config)|components\/admin\/WeeklyReport)/.test(file)
    ||file.startsWith('supabase/')||['src/app/actions.ts','package.json','package-lock.json'].includes(file));
  for(const file of protectedFiles)assert.equal(read(file),original(file),file);
  const functions=source=>{
    const tree=ts.createSourceFile('file.ts',source,ts.ScriptTarget.Latest,true),result=new Map();
    for(const node of tree.statements)if(ts.isFunctionDeclaration(node)&&node.name)result.set(node.name.text,node.getText(tree));
    return result;
  };
  const oldFunctions=functions(original('src/lib/weekly-report.ts')),newFunctions=functions(read('src/lib/weekly-report.ts'));
  const adapted=new Set(['buildWeeklyReport','buildOpponentDeckRanking','buildMyDeckWinRates','buildUnifiedMatchups','countUnifiedMatchups']);
  for(const [name,body]of oldFunctions)if(!adapted.has(name))assert.equal(newFunctions.get(name),body,'unchanged evaluation function '+name);
  const stripReport=s=>s.replace(/import .*period-report-data.*\n/g,'').replace(/import .*weekly-report";\n/g,'')
    .replace(/const WEEKLY_REPORT_MATCH_COLUMNS = .*\n/g,'').replace(/export async function getWeeklyReport\([\s\S]*?(?=export const getIsAdmin)/,'');
  assert.equal(stripReport(read('src/lib/data.ts')),stripReport(original('src/lib/data.ts')),'all non-period data paths');
  const migration=read('supabase/migrations/014_period_report_aggregates_v1.sql').replace(/--[^\n]*/g,'');
  assert.doesNotMatch(migration,/\b(create\s+(?:table|index|policy|type)|alter\s+(?:table|policy)|drop|insert|update|delete|truncate)\b/i);
  assert.equal((migration.match(/create or replace function/g)||[]).length,1);
  assert.ok(path.resolve('node_modules'));
});
