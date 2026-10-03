/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),ts=require('typescript');
const {base,changed,added}=require('./period-report-environment-scope.cjs');
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
const read=f=>require('./ui-display-scope.cjs').readBeforeUiDisplay(f);
test('period environment change preserves other pages/RPCs/RLS/dependencies and exact existing evaluator behavior',()=>{
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)if(!changed.has(f))assert.equal(read(f),git(['show',base+':'+f]),f);
 const actual=git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').filter(f=>!require('./obs-environment-scope.cjs').added.has(f)).sort();
 assert.deepEqual(actual,[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
 const source=read('src/lib/weekly-report.ts')
 .replace('  previousShare: number | null;','  previousShare: number;').replace('  shareChange: number | null;','  shareChange: number;')
 .replace('  environmentFilter?: { id: string; name: string; description: string };\n','')
 .replace('    matchDelta: number | null;\n    comparisonStatus?: "no_previous";','    matchDelta: number;')
 .replaceAll('row.shareChange !== null && ','').replaceAll('(b.shareChange ?? 0) - (a.shareChange ?? 0)','b.shareChange - a.shareChange').replaceAll('(a.shareChange ?? 0) - (b.shareChange ?? 0)','a.shareChange - b.shareChange');
 assert.equal(source,git(['show',base+':src/lib/weekly-report.ts']),'only nullable comparison support; no evaluation/date changes');
 const withoutReport=s=>ts.createSourceFile('data.ts',s,ts.ScriptTarget.Latest,true).statements.filter(n=>!ts.isImportDeclaration(n)&&n.name?.text!=='getWeeklyReport').map(n=>n.getText());
 assert.deepEqual(withoutReport(read('src/lib/data.ts')),withoutReport(git(['show',base+':src/lib/data.ts'])),'unrelated data loaders unchanged');
 const sql=read([...added].find(f=>f.endsWith('.sql'))).replace(/--[^\n]*/g,'');
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate|alter|policy|index)\b|match_input_|start_date/i);
 assert.match(sql,/stable security invoker/);assert.match(sql,/auth\.uid\(\) is null/);assert.match(sql,/public\.is_admin\(\)/);
 assert.match(sql,/m\.environment_id = p_environment_id/);assert.match(sql,/m\.played_at >= p\.starts and m\.played_at <= p\.ends/);
});
