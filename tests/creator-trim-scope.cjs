/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='84e2b04',hashes=require('./fixtures/creator-trim-source-hashes.json');
const added=new Set(['src/lib/creator/display-image.ts']);
function readBeforeTrim(file){const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');if(!Object.hasOwn(hashes,file))return source;assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed transparent trim change: '+file);return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,readBeforeTrim};
