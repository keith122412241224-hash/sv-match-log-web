/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const trigger=(page,label)=>page.getByRole('button',{name:new RegExp('^'+label+' ')});
async function choose(page,label,name,cls){
 await trigger(page,label).click();const dialog=page.getByRole('dialog',{name:label+'を選択',exact:true});
 const group=dialog.getByRole('button',{name:new RegExp('^'+cls+'（')});
 if(await group.getAttribute('aria-expanded')==='false')await group.click();
 await dialog.getByRole('button',{name,exact:true}).click();
 assert.equal(await dialog.count(),0);assert.ok((await trigger(page,label).innerText()).includes(name));
}
exports.choose=choose;
exports.verifyMatchSelection=async({page,origin,output,db,claim,ids,until,calls,idle,checks,normalFault})=>{
 const shots=path.join(output,'screenshots');fs.mkdirSync(shots,{recursive:true});
 const read=async(sql,args=[])=>{await idle();await db.exec('reset role');return(await db.query(sql,args)).rows;};
 const classes=['エルフ','ロイヤル','ウィッチ','ドラゴン','ナイトメア','ビショップ','ネメシス'];
 const extra=[];for(let i=0;i<28;i++){const id='00000000-0000-4000-8000-'+String(200+i).padStart(12,'0'),name=i===2?'長いデッキ名'.repeat(16):'追加デッキ'+i;extra.push({id,name,class:classes[i%7]});await read('insert into public.deck_archetypes(id,name,class_name) values($1,$2,$3)',[id,name,classes[i%7]]);}
 await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name=environment_id]').inputValue(), ids.env);
 await choose(page,'使用デッキ','デッキA','エルフ');await choose(page,'相手デッキ','デッキA','エルフ');
 const fields=()=>page.locator('form').filter({has:page.locator('[name=environment_id]')}).evaluate(f=>Object.fromEntries(new FormData(f)));
 let before=calls.length;const initial=await fields();
 await trigger(page,'使用デッキ').focus();await page.keyboard.press('Enter');
 let dialog=page.getByRole('dialog',{name:'使用デッキを選択',exact:true});
 assert.equal(await dialog.locator('h3').count(),7);
 await page.waitForFunction(()=>[...document.querySelectorAll('dialog[open] img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.equal(await dialog.locator('h3 img').count(),7);
 assert.deepEqual((await dialog.locator('h3').allTextContents()).map(s=>s.split('（')[0]),classes);
 assert.equal(await dialog.locator('[aria-pressed]').count(),30);
 assert.equal(await dialog.locator('[aria-pressed=true]').count(),1);
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await page.getByRole('button',{name:/^対戦時点の自分のランク/}).evaluate(e=>e.focus());assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))));
 for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))));}
 for(let i=0;i<18;i++){await page.keyboard.press('Shift+Tab');assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))));}
 for(const cls of classes){const group=dialog.getByRole('button',{name:new RegExp('^'+cls+'（')});assert.match(await group.innerText(),new RegExp(cls+'（'+(cls==='エルフ'||cls==='ロイヤル'?5:4)+'デッキ）'));}
 await dialog.getByRole('button',{name:/^ロイヤル（/}).click();assert.deepEqual(await fields(),initial);
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.ok(await trigger(page,'使用デッキ').evaluate(e=>e===document.activeElement));assert.deepEqual(await fields(),initial);
 await page.keyboard.press('Space');await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();assert.deepEqual(await fields(),initial);
 await trigger(page,'使用デッキ').click();await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(shots,'match-my.png')});await dialog.getByRole('button',{name:/^ロイヤル（/}).focus();await page.keyboard.press('Enter');await dialog.getByRole('button',{name:'デッキB',exact:true}).focus();await page.keyboard.press('Space');
 assert.equal((await fields()).my_archetype_id,ids.arch2);
 await trigger(page,'相手デッキ').click();dialog=page.getByRole('dialog',{name:'相手デッキを選択',exact:true});await page.screenshot({path:path.join(shots,'match-opponent.png')});await dialog.getByRole('button',{name:/^ロイヤル（/}).click();await dialog.getByRole('button',{name:'デッキB',exact:true}).click();
 assert.equal((await fields()).opponent_archetype_id,ids.arch2);assert.equal(calls.length,before,'picker produces zero server requests');
 await page.screenshot({path:path.join(shots,'match-both.png'),fullPage:true});
 const timing=[];
 for(const width of [320,390,768,1152,1920]){
  await page.setViewportSize({width,height:844});const start=performance.now();await trigger(page,'使用デッキ').click();dialog=page.getByRole('dialog',{name:'使用デッキを選択',exact:true});timing.push({width,openMs:Math.round(performance.now()-start)});
  for(const group of await dialog.locator('h3 button').all())if(await group.getAttribute('aria-expanded')==='false')await group.click();
  const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=844);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await dialog.locator('[data-deck-options]').evaluate(e=>e.scrollHeight>e.clientHeight));
  await dialog.getByRole('button',{name:extra[2].name,exact:true}).scrollIntoViewIfNeeded();assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))));
  await page.screenshot({path:path.join(shots,'mobile-popup-'+width+'.png')});await page.keyboard.press('Escape');
 }
 const savesBefore=(await read('select count(*)::int n from public.matches where request_id is not null'))[0].n;
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await until(async()=> (await read('select count(*)::int n from public.matches where request_id is not null'))[0].n===savesBefore+i+1);await page.getByRole('status').filter({hasText:'戦績を保存しました'}).waitFor();assert.equal((await fields()).my_archetype_id,ids.arch2);}
 const saved=await read('select * from public.matches where request_id is not null');for(const r of saved){assert.equal(r.my_archetype_id,ids.arch2);assert.equal(r.opponent_archetype_id,ids.arch2);}
 await page.reload({waitUntil:'networkidle'});assert.equal((await fields()).my_archetype_id,ids.arch2);
 await choose(page,'相手デッキ','デッキB','ロイヤル');normalFault.failWrite=true;await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await page.getByRole('alert').filter({hasText:'injected normal write failure'}).waitFor();const failed=await fields();await page.reload({waitUntil:'networkidle'});assert.equal((await fields()).my_archetype_id,failed.my_archetype_id);assert.equal((await fields()).opponent_archetype_id,failed.opponent_archetype_id);normalFault.failWrite=false;
 await page.getByRole('button',{name:'保存状態を確認して再試行',exact:true}).click();await until(async()=>!await page.evaluate(k=>sessionStorage.getItem(k),'svml:pending-match:'+ids.a));
 await read('delete from public.matches where request_id is not null');
 await page.goto(origin+'/?environment='+ids.env,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'戦績の操作',exact:true}).first().click();await page.getByRole('button',{name:'編集',exact:true}).click();
 await trigger(page,'相手デッキ').click();await page.waitForFunction(()=>[...document.querySelectorAll('dialog[open] img')].every(img=>img.complete&&img.naturalWidth>0));await page.screenshot({path:path.join(shots,'edit-nested.png')});assert.equal(await page.locator('dialog[open]').count(),2);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),1);assert.ok(await trigger(page,'相手デッキ').evaluate(e=>e===document.activeElement));
 await choose(page,'使用デッキ','デッキB','ロイヤル');await choose(page,'相手デッキ','デッキB','ロイヤル');await page.getByRole('button',{name:'編集をキャンセル',exact:true}).click();assert.equal((await read('select * from public.matches where id=$1',[ids.match]))[0].my_archetype_id,ids.arch);
 // Restore the original row after exercising real inactive and legacy preservation.
 const original=(await read('select * from public.matches where id=$1',[ids.match]))[0];
 await page.getByRole('button',{name:'戦績の操作',exact:true}).first().click();await page.getByRole('button',{name:'編集',exact:true}).click();await choose(page,'使用デッキ','デッキB','ロイヤル');await choose(page,'相手デッキ','デッキB','ロイヤル');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'戦績を更新しました'}).waitFor();
 const edited=(await read('select * from public.matches where id=$1',[ids.match]))[0];assert.equal(edited.my_archetype_id,ids.arch2);assert.equal(edited.opponent_archetype_id,ids.arch2);assert.deepEqual(edited.played_at,original.played_at);
 await read('update public.matches set my_archetype_id=$2,opponent_archetype_id=$2,my_deck_id=$3,opponent_deck_id=$4 where id=$1',[ids.match,ids.arch,original.my_deck_id,original.opponent_deck_id]);
 for(const legacy of [false,true]){
  if(legacy)await read('update public.matches set my_archetype_id=null,opponent_archetype_id=null where id=$1',[ids.match]);else await read('update public.deck_archetypes set is_active=false where id=$1',[ids.arch]);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績の操作',exact:true}).first().click();await page.getByRole('button',{name:'編集',exact:true}).click();
  await trigger(page,'使用デッキ').click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'戦績を更新しました'}).waitFor();
  const r=(await read('select * from public.matches where id=$1',[ids.match]))[0];assert.equal(r.my_archetype_id,legacy?null:ids.arch);assert.equal(r.opponent_archetype_id,legacy?null:ids.arch);assert.equal(r.my_deck_id,original.my_deck_id);assert.equal(r.opponent_deck_id,original.opponent_deck_id);assert.deepEqual(r.played_at,original.played_at);
  await read('update public.deck_archetypes set is_active=true where id=$1',[ids.arch]);
 }
 await read('update public.matches set my_archetype_id=$2,opponent_archetype_id=$2 where id=$1',[ids.match,ids.arch]);
 await page.goto(origin+'/guest',{waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();before=calls.length;
 await choose(page,'使用デッキ','デッキB','ロイヤル');await choose(page,'相手デッキ','デッキA','エルフ');await trigger(page,'相手デッキ').click();await page.screenshot({path:path.join(shots,'guest-picker.png')});await page.keyboard.press('Escape');await page.getByRole('button',{name:'入力を試す',exact:true}).click();
 const guest=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('svml:guest-matches:v1')));await until(async()=>(await guest())?.length===1);assert.equal((await guest())[0].my_archetype_id,ids.arch2);
 await page.getByRole('button',{name:'相性表',exact:true}).click();assert.match(await page.locator('main').innerText(),/100(?:\.0)?%/);
 await page.getByRole('button',{name:'ホーム',exact:true}).click();await page.getByRole('button',{name:'戦績の操作',exact:true}).first().click();await page.getByRole('button',{name:'編集',exact:true}).click();await choose(page,'相手デッキ','デッキB','ロイヤル');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'戦績を更新しました'}).waitFor();assert.equal((await guest())[0].opponent_archetype_id,ids.arch2);assert.equal(calls.length,before,'Guest operations make no API calls');
 await page.reload({waitUntil:'networkidle'});assert.equal((await guest())[0].opponent_archetype_id,ids.arch2);
 // Unknown legacy selections remain available in Guest edits, without replacing IDs.
 const missing=await guest();missing[0].my_deck_id=missing[0].my_archetype_id='unknown-my';missing[0].opponent_deck_id=missing[0].opponent_archetype_id='unknown-opponent';
 await page.evaluate(rows=>localStorage.setItem('svml:guest-matches:v1',JSON.stringify(rows)),missing);await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績の操作',exact:true}).first().click();await page.getByRole('button',{name:'編集',exact:true}).click();assert.match(await trigger(page,'使用デッキ').innerText(),/現在選択肢なし/);
 await trigger(page,'使用デッキ').click();const unknown=page.getByRole('dialog',{name:'使用デッキを選択',exact:true});assert.equal(await unknown.getByRole('button',{name:/クラス未設定/}).getAttribute('aria-expanded'),'true');assert.match(await unknown.locator('[aria-pressed=true]').innerText(),/現在選択肢なし/);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'変更を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'戦績を更新しました'}).waitFor();assert.equal((await guest())[0].my_archetype_id,'unknown-my');assert.equal((await guest())[0].opponent_archetype_id,'unknown-opponent');
 await page.evaluate(()=>{localStorage.removeItem('svml:guest-matches:v1');localStorage.removeItem('svml:last-my-choice-id');});
 for(const row of extra)await read('delete from public.deck_archetypes where id=$1',[row.id]);await claim();
 fs.writeFileSync(path.join(output,'deck-selection-timings.json'),JSON.stringify(timing,null,2));
 checks.push('deck popup: 30 IDs, canonical classes/counts, no request on class/selection, keyboard, focus, 5 widths, long labels, nested edit, real ID saves/retry/repeat, inactive/legacy preservation, Guest edit/storage/matrix/missing IDs');
};
