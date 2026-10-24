/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='19abda5448efc18fabbd58e5b92add01fd38426a',file='src/components/environment/EnvironmentData.tsx',hash='ce5b6adedd8fb40e0865a8d8eaf68ddbc93894ee1b06d3c90c0425787b1b263b';
const read=f=>fs.readFileSync(f,'utf8').replaceAll('\r\n','\n');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
function assertReviewed(){assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,'unreviewed environment deck display change');}
function readBeforeDeckData(f){if(f!==file)return read(f);assertReviewed();return git('show',base+':'+f);}
// Project only this exact reviewed file for historical inventory comparisons.
function historicalChanges(files,historicalBase){return files.filter(f=>f!==file||readBeforeDeckData(f)!==git('show',historicalBase+':'+f));}
module.exports={base,file,read,git,assertReviewed,readBeforeDeckData,historicalChanges};
