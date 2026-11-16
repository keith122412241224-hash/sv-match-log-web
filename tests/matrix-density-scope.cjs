/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='938514fd94f05767aafcace87bd94c047e275973';
const hashes=require('./fixtures/matrix-density-source-hashes.json');
const read=require('./environment-trends-copy-scope.cjs').readBeforeTrendCopy;
function assertReviewed(file){assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed matrix layout change: '+file);}
// Historical byte guards alone see the prior layout. Runtime tests use current source.
function readBeforeDensity(file){
  if(!Object.hasOwn(hashes,file))return read(file);
  assertReviewed(file);
  return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,assertReviewed,readBeforeDensity};
