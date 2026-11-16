/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const git=(rev,file)=>cp.execFileSync('git',['show',rev+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
test('historical dependency mismatch comes only from the committed Web Analytics addition; original security hashes remain valid',()=>{
  const revision='b9fe4b19935742f0b194cd72737ac5468a1a8e95';
  const hashes=require('./fixtures/security-audit-source-hashes.json');
  for(const file of ['package.json','package-lock.json']){
    const before=git(revision+'^',file),after=git(revision,file);
    assert.equal(createHash('sha256').update(before).digest('hex'),hashes[file]);
    const parsed=JSON.parse(after),old=JSON.parse(before);
    if(file==='package.json'){assert.equal(parsed.dependencies['@vercel/analytics'],'^2.0.1');delete parsed.dependencies['@vercel/analytics'];}
    else {assert.equal(parsed.packages[''].dependencies['@vercel/analytics'],'^2.0.1');assert.equal(parsed.packages['node_modules/@vercel/analytics'].version,'2.0.1');delete parsed.packages[''].dependencies['@vercel/analytics'];delete parsed.packages['node_modules/@vercel/analytics'];}
    assert.deepEqual(parsed,old);
    assert.equal(require('./site-metadata-scope.cjs').readBeforeSiteMetadata(file,after),before);
    assert.throws(()=>require('./site-metadata-scope.cjs').readBeforeSiteMetadata(file,after+' '));
  }
});
