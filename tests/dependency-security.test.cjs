/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),{createHash}=require('node:crypto'),sharp=require('sharp');
const {base,hashes,read}=require('./dependency-security-scope.cjs');
test('QA2-008 validates the exact dependency patch and preserves every application and SQL file',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),['package-lock.json','package.json']);
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,file);
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f));
 for(const file of files)assert.equal(read(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files,...require('./analysis-date-scope.cjs').added].sort());
 const before=JSON.parse(git(['show',base+':package.json'])),after=JSON.parse(read('package.json'));
 for(const name of ['fflate','next','sharp'])delete before.dependencies[name],delete after.dependencies[name];
 for(const name of ['eslint-config-next','postcss'])delete before.devDependencies[name],delete after.devDependencies[name];
 assert.deepEqual(after,before,'scripts, other dependencies and package settings remain identical');
});
test('security update resolves one patched sharp for both Creator and Next image processing',()=>{
 assert.equal(sharp.versions.sharp,'0.35.5');assert.equal(sharp.versions.vips,'8.18.7');assert.equal(sharp.versions.rsvg,'2.63.2');
 const {createRequire}=require('node:module');const fromNext=createRequire(require.resolve('next/package.json'));assert.equal(fromNext('sharp'),sharp);
});
test('updated native decoder handles wide, tall, square and transparent PNG/JPEG/WEBP',async()=>{
 for(const [width,height]of [[1200,64],[64,1200],[256,256]])for(const format of ['png','jpeg','webp']){
  const bytes=await sharp({create:{width,height,channels:4,background:{r:40,g:90,b:180,alpha:0.25}}})[format]().toBuffer();
  const decoder=sharp(bytes,{limitInputPixels:24000000,animated:false,failOn:'warning'}),m=await decoder.metadata();assert.equal(m.width,width);assert.equal(m.height,height);assert.equal(m.format,format);if(format!=='jpeg')assert.equal(m.hasAlpha,true);assert.ok((await decoder.stats()).channels.length>=3);
 }
});
test('updated native decoder rejects broken input and images beyond the existing pixel limit',async()=>{
 await assert.rejects(sharp(Buffer.from('not an image'),{limitInputPixels:24000000,failOn:'warning'}).metadata());
 const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'#fff'}}).png().toBuffer();
 await assert.rejects(sharp(huge,{limitInputPixels:24000000,animated:false,failOn:'warning'}).metadata(),/pixel limit/i);
 const bytes=await sharp({create:{width:256,height:256,channels:3,background:'#123456'}}).jpeg().toBuffer();
 await assert.rejects(sharp(bytes.subarray(0,Math.floor(bytes.length/2)),{failOn:'warning'}).stats());
});
