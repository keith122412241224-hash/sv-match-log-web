/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {trimTransparentImage,createDisplayImageCache}=require('../src/lib/creator/display-image');
const original=(bytes,type='image/png')=>({bytes,type,trimmed:false});
async function fixture(format='png',orientation){
 const pixels=Buffer.alloc(200*160*4);for(let y=50;y<110;y++)for(let x=70;x<130;x++){const i=(y*200+x)*4;pixels[i]=200;pixels[i+1]=80;pixels[i+2]=40;pixels[i+3]=x===70?1:128;}
 let image=sharp(pixels,{raw:{width:200,height:160,channels:4}});if(orientation)image=image.withMetadata({orientation});
 return {bytes:await image[format](format==='webp'?{lossless:true}:{}).toBuffer(),pixels};
}
test('transparent trim: exact alpha bounds, faint edges and visible pixels preserved for PNG and WEBP',async()=>{
 for(const format of ['png','webp']){const {bytes}=await fixture(format),copy=Buffer.from(bytes);const result=await trimTransparentImage(original(bytes,'image/'+format));assert.equal(result.trimmed,true);assert.deepEqual(bytes,copy);const m=await sharp(result.bytes).metadata();assert.equal(m.width,60);assert.equal(m.height,60);assert.equal(m.hasAlpha,true);assert.deepEqual(await sharp(result.bytes).raw().toBuffer(),await sharp(bytes).extract({left:70,top:50,width:60,height:60}).raw().toBuffer());}
});
test('transparent trim: opaque JPG/PNG, all-transparent, full-frame and single pixel remain valid',async()=>{
 for(const format of ['jpeg','png']){const bytes=await sharp({create:{width:120,height:80,channels:format==='jpeg'?3:4,background:'#fff'}})[format]().toBuffer();const source=original(bytes,'image/'+format);assert.equal(await trimTransparentImage(source),source);}
 const empty=await sharp({create:{width:120,height:80,channels:4,background:'#0000'}}).png().toBuffer();const source=original(empty);assert.equal(await trimTransparentImage(source),source);
 const pixels=Buffer.alloc(12*8*4);pixels[(5*12+7)*4+3]=1;const one=await trimTransparentImage(original(await sharp(pixels,{raw:{width:12,height:8,channels:4}}).png().toBuffer()));const m=await sharp(one.bytes).metadata();assert.equal(m.width,1);assert.equal(m.height,1);assert.equal((await sharp(one.bytes).raw().toBuffer())[3],1);
});
test('transparent trim: orientation is applied before cropping; 16-bit faint alpha remains inside bounds',async()=>{
 const f=await fixture('png',6),cropped=await trimTransparentImage(original(f.bytes));assert.deepEqual(await sharp(cropped.bytes).raw().toBuffer(),await sharp(f.bytes).autoOrient().extract({left:50,top:70,width:60,height:60}).raw().toBuffer());
 const pixels=new Uint16Array(10*8*4);pixels[(2*10+3)*4+3]=1;pixels[(5*10+7)*4+3]=65535;
 const bytes=await sharp(pixels,{raw:{width:10,height:8,channels:4}}).toColourspace('rgb16').png().toBuffer();assert.equal((await sharp(bytes).metadata()).depth,'ushort');
 const result=await trimTransparentImage(original(bytes));const m=await sharp(result.bytes).metadata();assert.equal(m.width,5);assert.equal(m.height,4);assert.equal(m.depth,'ushort');assert.equal((await sharp(result.bytes).toColourspace('rgb16').raw({depth:'ushort'}).toBuffer()).readUInt16LE(6),1);
});
test('derivative cache: coalesces requests, limits parallel loads, evicts and keys replacements separately',async()=>{
 const {bytes}=await fixture();const cache=createDisplayImageCache(100000,2);let reads=0,active=0,peak=0;
 const load=async()=>{reads++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;return original(bytes);};
 const results=await Promise.all(Array.from({length:8},()=>cache('original-a',load)));assert.equal(reads,1);assert.ok(results.every(r=>r===results[0]));
 await Promise.all(['b','c','d','replacement-a'].map(k=>cache(k,load)));assert.equal(peak,2);await cache('original-a',load);assert.equal(reads,6);
 let failureReads=0;const fail=async()=>{failureReads++;throw Error('storage offline');};await assert.rejects(cache('failed',fail));await assert.rejects(cache('failed',fail));assert.equal(failureReads,2);
 const broken=original(Buffer.from('invalid PNG'));let retries=0;for(let n=0;n<2;n++)assert.equal(await cache('decode-failure',async()=>{retries++;return broken;}),broken);assert.equal(retries,2);
 const tooSmall=createDisplayImageCache(1);let count=0;for(let i=0;i<2;i++)await tooSmall('large',async()=>{count++;return original(bytes);});assert.equal(count,2);
});
test('image route: original is byte-identical; defaults trim existing images, replacement invalidates, cache never bypasses authorization',async()=>{
 const serverPath=require.resolve('../src/lib/creator/server');const previous=require.cache[serverPath];let status=200,path='original',reads=0,exists=true;const {bytes}=await fixture();const replacement=await sharp({create:{width:30,height:40,channels:4,background:'#00ff00'}}).png().toBuffer();
 class CreatorError extends Error{constructor(message,status){super(message);this.status=status;}}
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:exists?{object_path:path}:null,error:null})})})}),storage:{from:()=>({download:async()=>{reads++;return{data:new Blob([path==='original'?bytes:replacement],{type:'image/png'}),error:null};}})}};
 require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:{CreatorError,databaseError:()=>{},creatorClient:async()=>{if(status!==200)throw new CreatorError('denied',status);return{client};}}};
 try{const {GET}=require('../src/app/admin/creator/images/[id]/route');const id='b0000000-0000-4000-8000-000000000001';const get=(q='')=>GET(new Request('https://example.test/admin/creator/images/'+id+q),{params:Promise.resolve({id})});
 const trimmed=await get();assert.equal(trimmed.headers.get('x-creator-image-variant'),'trimmed');assert.equal(trimmed.headers.get('cache-control'),'private, no-store');assert.equal((await sharp(Buffer.from(await trimmed.arrayBuffer())).metadata()).width,60);
 assert.deepEqual(Buffer.from(await(await get('?variant=original')).arrayBuffer()),bytes);assert.equal(reads,2);await get();assert.equal(reads,2);
 for(status of [401,403])assert.equal((await get()).status,status);assert.equal(reads,2);status=200;exists=false;assert.equal((await get()).status,404);exists=true;path='replacement';assert.deepEqual(Buffer.from(await(await get()).arrayBuffer()),replacement);
 }finally{if(previous)require.cache[serverPath]=previous;else delete require.cache[serverPath];}
});
