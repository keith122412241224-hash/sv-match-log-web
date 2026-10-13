/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='859afb3df7000898b029d3e8ba797e2329868691';
const hashes=require('./fixtures/dependency-security-source-hashes.json');
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
// Preserve historical feature assertions, but only for these exact reviewed dependency files.
function readBeforeDependencySecurity(file){
 const source=read(file);if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed dependency change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,read,readBeforeDependencySecurity};
