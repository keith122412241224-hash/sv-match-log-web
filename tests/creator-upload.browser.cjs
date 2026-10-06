/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
module.exports=async({page,db,objects,report})=>{
  const directory=process.env.CREATOR_REPRO_DIR||path.resolve('build/creator-evidence/upload-fixtures');
  if(!process.env.CREATOR_REPRO_DIR){fs.mkdirSync(directory,{recursive:true});await sharp({create:{width:128,height:96,channels:4,background:{r:255,g:0,b:0,alpha:0.5}}}).avif().toFile(path.join(directory,'downloaded-avif.png'));}
  const files=fs.readdirSync(directory).filter(f=>/\.png$/i.test(f)).map(f=>path.join(directory,f));
  assert.ok(files.length>0);
  const before=new Set((await db.query('select id from public.creator_images')).rows.map(r=>r.id));
  await page.getByLabel('画像アップロード').setInputFiles(files);
  await page.getByRole('status').filter({hasText:files.length+'枚の画像を保存しました。'}).waitFor({timeout:120000});
  const created=(await db.query('select * from public.creator_images')).rows.filter(r=>!before.has(r.id));
  assert.equal(created.length,files.length);
  for(const row of created){
    const original=await sharp(fs.readFileSync(path.join(directory,row.name))).metadata();
    const object=objects.get(row.object_path),decoded=await sharp(object.bytes).metadata();
    assert.equal(object.type,'image/png');assert.equal(decoded.format,'png');assert.equal(decoded.width,original.width);assert.equal(decoded.height,original.height);
    if(original.hasAlpha)assert.equal(decoded.hasAlpha,true);
    await sharp(object.bytes).stats();
  }
  // Replacement goes through the same normalization path and preserves the ID.
  const chosen=created[0];
  await page.getByRole('region',{name:'画像ライブラリ'}).getByRole('button',{name:chosen.name+'を選択',exact:true}).click();
  await page.getByRole('region',{name:'選択画像の管理'}).getByLabel('画像を差し替え').setInputFiles(files[0]);
  await page.getByRole('status').filter({hasText:'1枚の画像を保存しました。'}).waitFor();
  const updated=(await db.query('select * from public.creator_images where id=$1',[chosen.id])).rows[0];assert.equal(updated.id,chosen.id);assert.equal(updated.revision,chosen.revision+1);assert.equal((await sharp(objects.get(updated.object_path).bytes).metadata()).format,'png');
  report.checks.push(`Upload regression: ${files.length} mislabeled AVIF files upload as decoded PNG with dimensions/alpha preserved; replacement preserves image ID`);
};
