/* eslint-disable @typescript-eslint/no-require-imports */
// Later committed site changes were missing from the historical security guard.
// Verify exact committed bytes before projecting; never replace expected hashes.
const cp=require('node:child_process'),assert=require('node:assert/strict');
const before='b9fe4b19935742f0b194cd72737ac5468a1a8e95^';
const after='b318f771a272a04bbfb8eef196401bcf21d7e21b';
const files=['package.json','package-lock.json','src/app/layout.tsx','src/app/privacy/page.tsx'];
const git=(rev,file)=>cp.execFileSync('git',['show',rev+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
function readBeforeSiteMetadata(file,source){
  if(!files.includes(file))return source;
  assert.equal(source,git(after,file),'committed analytics/AdSense/privacy bytes must remain unchanged: '+file);
  return git(before,file);
}
module.exports={files,readBeforeSiteMetadata};
