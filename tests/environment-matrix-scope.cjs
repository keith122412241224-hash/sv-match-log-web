/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='bdbeafcdfabbc486eab16ecbbc151b5235df0517';
const hashes=require('./fixtures/environment-matrix-source-hashes.json');
const added=new Set(['src/lib/environment-matrix.ts']);
const read=require('./matrix-density-scope.cjs').readBeforeDensity;
function assertReviewed(file){assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed environment matrix change: '+file);}
// Only historical byte guards project to the reviewed pre-change implementation.
// All runtime, browser and SQL tests execute current source without projection.
function readBeforeEnvironmentMatrix(file){
  if(!Object.hasOwn(hashes,file))return read(file);
  assertReviewed(file);assert.ok(!added.has(file));
  return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
function excludeReviewedMatrixChanges(files){return files.filter(file=>{if(!Object.hasOwn(hashes,file))return true;assertReviewed(file);return !added.has(file);});}
module.exports={base,hashes,added,assertReviewed,readBeforeEnvironmentMatrix,excludeReviewedMatrixChanges};
