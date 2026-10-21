/* eslint-disable @typescript-eslint/no-require-imports */
// Called by the actual Next -> localhost -> isolated PostgreSQL browser suite.
const assert=require('node:assert/strict'),path=require('node:path');
const {SHADOWVERSE_CLASSES}=require('../src/lib/constants');
const selector=page=>page.getByRole('region',{name:'表示するデッキ',exact:true});
const outer=page=>selector(page).getByRole('button',{name:/^表示するデッキ/});
// SSR and client remounts can reorder attributes and text markers without changing the DOM semantics.
const matrixHtml=page=>page.locator('table').evaluate(root=>{const clone=root.cloneNode(true),walker=document.createTreeWalker(clone,NodeFilter.SHOW_COMMENT),comments=[];while(walker.nextNode())comments.push(walker.currentNode);comments.forEach(n=>n.remove());for(const e of [clone,...clone.querySelectorAll('*')]){const attrs=[...e.attributes].map(a=>[a.name,a.name==='style'?e.style.cssText:a.value]).sort(([a],[b])=>a.localeCompare(b));for(const a of [...e.attributes])e.removeAttribute(a.name);for(const [k,v]of attrs)e.setAttribute(k,v);}clone.normalize();return clone.outerHTML;});
async function openSelector(page){
 if(await outer(page).getAttribute('aria-expanded')==='false')await outer(page).click();
 for(const button of await selector(page).locator('h3 button').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();
}
function selectorDecks(h){
 const extra=[['追加ウィッチ2','ウィッチ'],['長いデッキ名'.repeat(12),'ウィッチ'],['ElfDeckWithoutSpaces'.repeat(8),'エルフ'],['エルフのデッキ','エルフ'],['ビショップのデッキ','ビショップ'],['新しいクラスのデッキ','未定義'],['クラス未設定のデッキ','']];
 return [...h.decks,...extra.map(([name,class_name],i)=>({id:h.uuid(900+i),name,class_name,is_active:true}))];
}
async function checkSelection(page,decks,ids){
 const selected=new Set(ids),visible=decks.filter(d=>selected.has(d.id));
 assert.match(await outer(page).innerText(),new RegExp(`${visible.length} / ${decks.length}デッキを表示中`));
 const buttons=selector(page).locator('button[aria-pressed]');assert.equal(await buttons.count(),decks.length);
 const actual=await buttons.evaluateAll(es=>es.map(e=>({name:e.innerText,pressed:e.getAttribute('aria-pressed')})));
 for(const d of decks)assert.equal(actual.find(a=>a.name===d.name)?.pressed,selected.has(d.id)?'true':'false',d.name);
 if(!visible.length){assert.equal(await page.locator('tbody td').count(),0);assert.equal(await page.getByText('表示するデッキが選択されていません。',{exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'PNG保存',exact:true}).isDisabled(),true);}
 else{
  assert.deepEqual((await page.locator('tbody th').allTextContents()).map(s=>s.trim()),visible.map(d=>d.name));
  assert.deepEqual((await page.locator('thead th').allTextContents()).slice(1).map(s=>s.trim()),visible.map(d=>d.name));
  assert.equal(await page.locator('tbody td').count(),visible.length**2);
 }
 const classes=[...SHADOWVERSE_CLASSES,'その他'];
 for(const name of classes){const members=decks.filter(d=>(SHADOWVERSE_CLASSES.includes(d.class_name)?d.class_name:'その他')===name);if(!members.length)continue;const region=selector(page).getByRole('region',{name:name+'のデッキ',exact:true,includeHidden:true});const count=members.filter(d=>selected.has(d.id)).length;assert.match(await region.locator('h3 button').textContent(),new RegExp(`（${count} / ${members.length}）`));assert.equal(await region.getByRole('button',{name:name+'を'+(count===members.length?'全解除':'全選択'),exact:true,includeHidden:true}).count(),1);}
}
async function exerciseSelector({page,decks,report,out,label,exportMatrix}){
 const record=name=>(report.deckSelectorChecks??=[]).push(label+': '+name),all=decks.map(d=>d.id),calls=report.calls.length;
 const region=selector(page),toggle=outer(page);await page.setViewportSize({width:1152,height:1000});
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await region.getByRole('button',{name:'全表示',exact:true}).count(),0);await checkSelection(page,decks,all);
 const matrixBefore=await matrixHtml(page);await page.screenshot({path:path.join(out,label+'-selector-closed.png'),fullPage:true});
 await toggle.focus();await page.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 assert.ok((await region.locator('h3 button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-expanded')))).every(v=>v==='false'));
 const expectedGroups=[...SHADOWVERSE_CLASSES.filter(c=>decks.some(d=>d.class_name===c)),'その他'];assert.deepEqual(await region.locator('section').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),expectedGroups.map(c=>c+'のデッキ'));
 await page.screenshot({path:path.join(out,label+'-selector-open.png'),fullPage:true});
 await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await matrixHtml(page),matrixBefore);await toggle.click();record('initial closed, Enter/Space, group order, no selection changes');
 const target='ウィッチ',group=region.getByRole('region',{name:target+'のデッキ',exact:true}),head=group.locator('h3 button'),members=decks.filter(d=>d.class_name===target);
 await head.focus();await page.keyboard.press('Space');assert.equal(await head.getAttribute('aria-expanded'),'true');
 assert.deepEqual(await group.locator('button[aria-pressed]').allTextContents(),members.map(d=>d.name));
 await page.keyboard.press('Tab');assert.equal(await group.getByRole('button',{name:target+'を全解除',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.screenshot({path:path.join(out,label+'-class-expanded.png'),fullPage:true});
 await group.locator('button[aria-pressed]').first().click();await checkSelection(page,decks,all.filter(id=>id!==members[0].id));
 await group.getByRole('button',{name:target+'を全選択',exact:true}).click();await checkSelection(page,decks,all);
 await group.getByRole('button',{name:target+'を全解除',exact:true}).click();const kept=all.filter(id=>!members.some(d=>d.id===id));await checkSelection(page,decks,kept);assert.equal(await head.getAttribute('aria-expanded'),'true');
 await page.screenshot({path:path.join(out,label+'-class-cleared.png'),fullPage:true});
 await head.click();assert.equal(await head.getAttribute('aria-expanded'),'false');await group.getByRole('button',{name:target+'を全選択',exact:true}).click();assert.equal(await head.getAttribute('aria-expanded'),'false');await checkSelection(page,decks,all);
 record('individual, partial-to-full, class clear/select, other classes unchanged, independent controls and keyboard focus');
 await region.getByRole('button',{name:'全非表示',exact:true}).click();await checkSelection(page,decks,[]);await toggle.click();await checkSelection(page,decks,[]);await toggle.click();
 await group.getByRole('button',{name:target+'を全選択',exact:true}).click();await checkSelection(page,decks,members.map(d=>d.id));
 await region.getByRole('button',{name:'全表示',exact:true}).click();await checkSelection(page,decks,all);assert.equal(await matrixHtml(page),matrixBefore);record('global clear, empty guidance/disabled PNG, class restore, both axes and original ordering');
 await openSelector(page);
 const names=await region.locator('button[aria-pressed]').allTextContents();assert.equal(names.length,new Set(names).size);assert.deepEqual([...names].sort(),decks.map(d=>d.name).sort());
 for(const width of [320,390,768,1152,1920]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert.ok(await region.evaluate(e=>e.scrollWidth<=e.clientWidth),'selector overflow '+width);
  const fits=await region.locator('button').evaluateAll(es=>es.every(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&e.scrollWidth<=e.clientWidth;}));assert.ok(fits,'long labels and controls fit '+width);
  if(width===390)await page.screenshot({path:path.join(out,label+'-selector-mobile.png'),fullPage:true});record('responsive and long Japanese/unbroken Latin names '+width+'px');
 }
 await page.setViewportSize({width:1152,height:1000});await group.getByRole('button',{name:target+'を全解除',exact:true}).click();await checkSelection(page,decks,kept);
 const selectedTable=await matrixHtml(page);await toggle.click();assert.equal(await matrixHtml(page),selectedTable);await page.screenshot({path:path.join(out,label+'-selected-matrix.png'),fullPage:true});
 await exportMatrix(label+'-class-selection-export');assert.equal(report.calls.length,calls,'all selector actions and export perform no RPC/refetch');record('collapsed selection persists; exact selected PNG excludes selector; zero RPCs');
}
async function exerciseDeckUpdates({page,decks,report,h,setDecks,origin}){
 const record=name=>(report.deckSelectorChecks??=[]).push('updates: '+name);
 await page.goto(origin+'/matrix?'+new URLSearchParams({environment:h.NEW,scope:'mine'}),{waitUntil:'networkidle'});await openSelector(page);
 await page.evaluate(()=>{window.selectorDocument='same-document';});
 await selector(page).getByRole('button',{name:'全非表示',exact:true}).click();
 for(const d of decks.slice(0,2))await selector(page).locator('button[aria-pressed]').filter({hasText:d.name}).click();await checkSelection(page,decks,decks.slice(0,2).map(d=>d.id));
 async function update(next,ranks,{env=h.NEW,scope='mine'}={}){
  setDecks(next);await page.locator('select[name=environment]').selectOption(env);await page.locator('select[name=scope]').selectOption(scope);
  await page.locator('button[aria-haspopup=dialog]').click();const dialog=page.getByRole('dialog',{name:'ランクを選択'});
  for(const box of await dialog.locator('input[type=checkbox][value]').all()){const value=await box.getAttribute('value');await box.setChecked(ranks.includes(value));}
  const n=report.calls.length;await dialog.getByRole('button',{name:'適用',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('ranks')===ranks.join(',')&&u.searchParams.get('scope')===scope&&u.searchParams.get('environment')===env);await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(()=>window.selectorDocument),'same-document');assert.equal(await outer(page).getAttribute('aria-expanded'),'true');assert.equal(report.calls.length,n+1);
 }
 const added={id:h.uuid(999),name:'更新で追加されたデッキ',class_name:'ロイヤル',is_active:true};let next=[...decks,added];
 await update(next,['a']);await checkSelection(page,next,decks.slice(0,2).map(d=>d.id));record('new deck stays unselected while prior selections remain');
 next=next.filter(d=>d.id!==decks[0].id);await update(next,['aa'],{env:h.OLD,scope:'all'});await checkSelection(page,next,[decks[1].id]);record('removed selected deck dropped; other selection retained across environment/scope/rank changes');
 next=next.filter(d=>d.id!==decks[1].id);await update(next,['b']);await checkSelection(page,next,next.map(d=>d.id));record('all previous selections removed -> existing fallback selects all');
 await selector(page).getByRole('button',{name:'全非表示',exact:true}).click();await checkSelection(page,next,[]);
 next=[...next].reverse();await update(next,['c']);await checkSelection(page,next,next.map(d=>d.id));record('empty selection then new props -> existing fallback selects all in new metadata order');
 await page.reload({waitUntil:'networkidle'});assert.equal(await outer(page).getAttribute('aria-expanded'),'false');await checkSelection(page,next,next.map(d=>d.id));record('reload closes selector and retains initial all-selected behavior');
}
module.exports={openSelector,selectorDecks,exerciseSelector,exerciseDeckUpdates};
