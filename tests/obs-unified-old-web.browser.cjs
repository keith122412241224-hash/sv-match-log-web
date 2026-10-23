/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,context,db,origin,report})=>{
 const {newTierDocument}=require('../src/lib/creator/model');
 const post=async data=>{const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});assert.equal(r.status(),200,await r.text());return r.json();};
 const tier=(await post({action:'save',document:newTierDocument()})).work;
 const corr=(await post({action:'create-correlation',tierId:tier.id,tierRevision:tier.revision})).correlation;
 const old=(await post({action:'save-obs-set',values:{name:'旧Webセット',tier_work_id:tier.id,correlation_id:corr.id}})).set;
 assert.equal(old.environment_id,null);assert.equal(old.display_mode,'continuous');
 await page.goto(origin+'/admin/creator/obs-sets?set='+old.id,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'OBS表示セット',exact:true}).waitFor();await page.getByLabel('セット名',{exact:true}).fill('旧Webで再編集');await page.getByRole('button',{name:'セットを保存',exact:true}).click();await page.getByRole('status').filter({hasText:'OBSセットを保存しました'}).waitFor();
 const after=(await db.query('select * from creator_obs_sets where id=$1',[old.id])).rows[0];assert.equal(after.name,'旧Webで再編集');assert.equal(after.revision,old.revision+1);assert.equal(after.tier_work_id,tier.id);assert.equal(after.correlation_id,corr.id);
 const obs=await context.newPage();for(const [route,t,c]of [[`/admin/obs/composition/${old.id}`,1,1],[`/admin/obs/tier/${tier.id}`,1,0],[`/admin/obs/correlation/${tier.id}`,0,1],[`/admin/obs/set/${tier.id}`,1,1]]){await obs.goto(origin+route,{waitUntil:'networkidle'});assert.equal(await obs.locator('[data-tier-artwork]').count(),t);assert.equal(await obs.locator('[data-correlation-artwork]').count(),c);}
 await post({action:'delete-obs-set',id:old.id,revision:after.revision});assert.equal((await db.query('select * from creator_obs_sets')).rows.length,0);assert.equal((await db.query('select * from creator_tier_works')).rows.length,1);assert.equal((await db.query('select * from creator_correlations')).rows.length,1);
 await obs.close();report.checks.push('actual da703005 old Web + upgraded DB: old API create/edit/delete, revision, retained works, four OBS URLs');
};
