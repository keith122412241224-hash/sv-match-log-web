/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='504a05ed275e3c78ccd326b3a58596b978d77c88';
const hashes=require('./fixtures/analysis-matchups-source-hashes.json');
const added=new Set(['src/components/analysis/AnalysisMatchups.tsx','src/lib/analysis-matchups.ts']);
function assertReviewed(file){assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex'),hashes[file],'unreviewed matchup presentation: '+file);}
// Only historical byte guards receive this projection. Runtime tests use live source.
function readBeforeMatchups(file){
 if(!Object.hasOwn(hashes,file))return fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 assertReviewed(file);assert.ok(!added.has(file));
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,assertReviewed,readBeforeMatchups};
