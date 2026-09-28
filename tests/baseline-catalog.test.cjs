/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('catalog comparison rejects missing audit input rather than reporting parity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'baseline-catalog-'));
 try {
  const file=path.join(dir,'invalid.json');fs.writeFileSync(file,'{}');
  const result=cp.spawnSync(process.execPath,['scripts/compare-baseline-catalog.cjs',file,file],{encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/unexpected catalog format/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
