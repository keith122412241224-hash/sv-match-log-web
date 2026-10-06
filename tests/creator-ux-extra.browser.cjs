/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({page,files,report,out})=>{
 const library=page.getByRole('region',{name:'画像ライブラリ'});
 assert.ok(await library.locator('article').count()>=20,'real large library');
 for(const width of [1920,1440,768,390,320]){
  await page.setViewportSize({width,height:1080});
  await page.screenshot({path:path.join(out,'library-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.setViewportSize({width:1440,height:1080});
 const before=await library.locator('article').count();
 await page.getByLabel('画像アップロード').setInputFiles([{...files[0],name:'success.png'},{name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')}]);
 await page.getByRole('alert').filter({hasText:'1枚の画像を保存しました。1枚失敗。'}).waitFor();
 assert.equal(await library.locator('article').count(),before+2);
 const failed=library.locator('article').filter({hasText:'invalid.svg'});assert.ok((await failed.textContent()).includes('失敗'));assert.equal(await failed.locator('button').count(),0);
 const choose=library.getByRole('button',{name:'success.pngを選択',exact:true});await choose.focus();await page.keyboard.press('Enter');
 const target=page.getByRole('button',{name:'ここに配置：S',exact:true});await target.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('[data-tier-artwork] img').count(),1);
 await page.getByRole('button',{name:'success.pngを選択 (S 1)',exact:true}).click();
 await page.getByRole('button',{name:'取り除く',exact:true}).click();assert.equal(await page.locator('[data-tier-artwork] img').count(),0);
 await choose.click();await page.getByRole('button',{name:'ここに配置：S',exact:true}).click();
 await page.getByRole('region',{name:'選択画像の管理'}).getByRole('button',{name:'画像を削除',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'編集中のTier表で使用中'}).waitFor();
 await page.getByRole('button',{name:'success.pngを選択 (S 1)',exact:true}).click();await page.getByRole('button',{name:'取り除く',exact:true}).click();
 await page.getByRole('region',{name:'選択画像の管理'}).getByRole('button',{name:'画像を削除',exact:true}).click();
 await page.getByRole('status').filter({hasText:'変更を保存しました'}).waitFor();assert.equal(await choose.count(),0);
 report.checks.push('Phase 2.5: real 27-image wrapping library at all five widths; partial upload failure labelled and unselectable; keyboard placement; remove placement; reject in-use delete; delete unused image');
};
