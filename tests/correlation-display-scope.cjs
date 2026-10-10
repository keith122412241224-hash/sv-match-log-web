/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const v4=require('./environment-dashboard-v4-scope.cjs');
const base='9339bf4',hashes=require('./fixtures/correlation-display-source-hashes.json');
const added=new Set(['src/lib/creator/correlation-display.ts',...v4.added]);
function readBeforeDisplay(file){const source=v4.readBeforeV4(file);if(!Object.hasOwn(hashes,file))return source;assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed correlation presentation change: '+file);return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,readBeforeDisplay};
