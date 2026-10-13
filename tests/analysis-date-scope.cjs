/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),{createHash}=require('crypto');
const base='adc78e421fdbaddfd9b0218594ada5ab21d04319';
const hashes=require('./fixtures/analysis-date-source-hashes.json');
const added=new Set(['src/lib/analysis-date-query.ts','src/components/analysis/AnalysisDateQueryError.tsx']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
// Historical scope guards receive the old source only after this exact patch is checked.
// Dedicated date tests exercise the current code; no runtime/behavior test is projected.
function readBeforeAnalysisDates(file){
 const source=read(file);if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed Analysis date change: '+file);
 assert(!added.has(file),'new date file has no historical version');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,read,readBeforeAnalysisDates};
