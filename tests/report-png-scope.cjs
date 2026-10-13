/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='ec001251c1ed1cfd7cb3c7c6e2550e2f003f2255';
const hashes=require('./fixtures/report-png-source-hashes.json');
const added=new Set(['src/lib/report-png-snapshot.ts',...require('./analysis-date-scope.cjs').added,...require('./creator-pagination-scope.cjs').added]);
const read=file=>require('./dependency-security-scope.cjs').readBeforeDependencySecurity(file);
// Historical scope checks see their original input only after validating the exact PNG patch.
function readBeforeReportPng(file){
 const source=read(file);if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed PNG change: '+file);
 assert.ok(!added.has(file),'new PNG utility has no historical source');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,read,readBeforeReportPng};
