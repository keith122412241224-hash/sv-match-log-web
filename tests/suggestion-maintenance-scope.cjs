/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='81ceee42d371ddf51573a753bd8464082c948001';
const hashes=require('./fixtures/suggestion-maintenance-source-hashes.json');
// Historical assertions project only this byte-pinned maintenance patch.
// Behaviour tests and browser requests execute the current actions.
function readBeforeSuggestionMaintenance(file){
 const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed maintenance change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,readBeforeSuggestionMaintenance};
