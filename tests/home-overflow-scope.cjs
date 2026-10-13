/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('child_process'),assert=require('assert/strict'),{createHash}=require('crypto');
// Historical scope tests receive the old Home only after the entire reviewed file is verified.
// Runtime/browser tests always exercise current source, including the overflow regression.
function readBeforeHomeOverflow(file){
 const source=require('./creator-pagination-scope.cjs').readBeforeCreatorPagination(file);
 if(file!=='src/app/page.tsx')return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),'2094999501b1cb0897a089c0387bc0de2a6ffb336cf1289dabc9779fe5232715','unreviewed Home overflow change');
 return cp.execFileSync('git',['show','3262c7baaa254221eb6e4de16a5d0c643ab4c7d3:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={readBeforeHomeOverflow};
