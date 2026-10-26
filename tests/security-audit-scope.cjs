/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='7821b257aea255e4e5cf6fc7f39755b35a4ef131';
const hashes=require('./fixtures/security-audit-source-hashes.json');
// Historical byte-scope tests only. Behavior tests always import the current code.
function readBeforeSecurityAudit(file){
 const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed security update: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
function excludeReviewedSecurityChanges(files){
 return files.filter(file=>{if(!Object.hasOwn(hashes,file))return true;readBeforeSecurityAudit(file);return false;});
}
module.exports={base,hashes,readBeforeSecurityAudit,excludeReviewedSecurityChanges};
