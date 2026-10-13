/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('assert/strict'),cp=require('child_process'),{createHash}=require('crypto');
const {base,hashes,added,read,readBeforeAnalysisDates}=require('./analysis-date-scope.cjs');
test('QA2-005 pins date validation only and preserves every other source, SQL and dependency',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),['src/app/analysis/page.tsx','src/app/api/analysis/route.ts','src/lib/analysis-page-data.ts','src/components/analysis/AnalysisDateTimeField.tsx','src/components/analysis/AnalysisDashboard.tsx',...added].sort());
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,file);
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeAnalysisDates(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
