/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {validateMatrixPngSize,matrixPngFile,MATRIX_PNG_TOO_LARGE}=require('../src/lib/matrix-png');
test('matrix raster allocation: mobile boundaries, invalid dimensions and desktop 30-deck budget',()=>{
 assert.deepEqual(validateMatrixPngSize(1000,900,true),{width:1000,height:900,pixelRatio:2,canvasWidth:2000,canvasHeight:1800});
 assert.equal(validateMatrixPngSize(2048,976,true).canvasWidth,4096);
 for(const [w,h]of [[2049,100],[100,2049],[2000,1001],[0,1],[-1,1],[NaN,1],[Infinity,1]])assert.throws(()=>validateMatrixPngSize(w,h,true),{name:'RangeError',message:MATRIX_PNG_TOO_LARGE});
 assert.equal(validateMatrixPngSize(4300,2200,false).canvasWidth,8600);
 for(const [w,h]of [[8193,100],[100,8193],[5000,5000]])assert.throws(()=>validateMatrixPngSize(w,h,false),/デッキ数を減らして/);
});
test('matrix PNG File retains every byte and name, rejects failed/invalid canvas results',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,1,255]),name='sv-matchup-2026-10-22.png';
 const file=matrixPngFile('data:image/png;base64,'+bytes.toString('base64'),name);
 assert.ok(file instanceof File);assert.equal(file.name,name);assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
 for(const invalid of ['data:,','data:image/jpeg;base64,AAA=','data:image/png;base64,AA==','not-a-url'])assert.throws(()=>matrixPngFile(invalid,name));
});
test('matrix PNG scope: exact four product files; unchanged aggregation, auth, SQL, dependencies and inventory',()=>{
 const s=require('./matrix-mobile-png-share-scope.cjs'),git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8'}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(s.hashes).sort(),['src/components/MatchupMatrix.tsx','src/components/analysis/AnalysisPngPreview.tsx','src/components/PngSharePreview.tsx','src/lib/matrix-png.ts'].sort());Object.keys(s.hashes).forEach(s.assertReviewed);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeMatrixPng(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
