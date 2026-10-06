/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='9339bf4',hashes=require('./fixtures/correlation-display-source-hashes.json');
const added=new Set(['src/lib/creator/correlation-display.ts']);
function readBeforeDisplay(file){const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');if(!Object.hasOwn(hashes,file))return source;assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed correlation presentation change: '+file);return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,readBeforeDisplay};
