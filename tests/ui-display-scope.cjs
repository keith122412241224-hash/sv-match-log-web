/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='981843eb2456af32ba50707f68ba70eb0c5921b7';
const hashes=require('./fixtures/ui-display-source-hashes.json');
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
// Preserve historical guards without exempting whole files from review: only
// these seven exact UI revisions may project back to the pre-cleanup source.
function readBeforeUiDisplay(file){
 const source=require('./obs-environment-scope.cjs').readBeforeObs(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed UI source change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,read,readBeforeUiDisplay};
