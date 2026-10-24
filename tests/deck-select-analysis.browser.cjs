/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {openFilters}=require('./analysis-filter-ux.browser.cjs');

exports.verifyAnalysisSelection=async({page,origin,out,report,decks,go,quick,settle,compare,setDelay,check})=>{
 const trigger=label=>page.getByRole('button',{name:new RegExp('^'+label+' ')}),form=()=>page.locator('form[action="/analysis"]');
 const values=()=>form().evaluate(f=>Object.fromEntries(new FormData(f)));
 const pick=async(label,deck)=>{await openFilters(page);await trigger(label).click();const d=page.getByRole('dialog',{name:label+'を選択',exact:true});await d.getByRole('button',{name:'選択をクリア',exact:true}).click();const group=d.getByRole('button',{name:new RegExp('^'+deck.class_name+'（')});if(await group.getAttribute('aria-expanded')!=='true')await group.click();await d.getByRole('checkbox',{name:deck.name,exact:true}).check();await d.getByRole('button',{name:'決定',exact:true}).click();};
 const apply=async()=>{await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');await settle();};
 await go('?scope=all&winRateMode=combined');const before=report.rpc.length,url=page.url();
 for(const [label,shot]of [['使用デッキ','analysis-my'],['相手デッキ','analysis-opponent']]){
  await trigger(label).click();const d=page.getByRole('dialog',{name:label+'を選択',exact:true});assert.equal(await d.locator('h3 button[aria-expanded=true]').count(),0);
  await d.getByRole('button',{name:new RegExp('^'+decks[0].class_name+'（')}).click();await page.screenshot({path:out+'/screenshots/'+shot+'.png'});await d.getByRole('checkbox',{name:decks[0].name,exact:true}).check();await d.getByRole('button',{name:'決定',exact:true}).click();
 }
 assert.equal((await values()).myDeck,decks[0].id);assert.equal((await values()).opponentDeck,decks[0].id);assert.equal(page.url(),url);assert.equal(report.rpc.length,before);
 // Unrelated summary render must not reset draft control state.
 await page.getByLabel('並び順',{exact:true}).selectOption('win-desc');assert.equal((await values()).myDeck,decks[0].id);
 await apply();assert.equal(report.rpc.length,before+1);assert.equal(new URL(page.url()).searchParams.get('myDeck'),decks[0].id);assert.equal(new URL(page.url()).searchParams.get('opponentDeck'),decks[0].id);await compare();
 await pick('相手デッキ',decks[1]);await apply();await compare();await form().screenshot({path:out+'/screenshots/analysis-both-applied.png'});
 await page.reload({waitUntil:'networkidle'});await openFilters(page);assert.equal((await values()).myDeck,decks[0].id);assert.equal((await values()).opponentDeck,decks[1].id);assert.ok((await trigger('相手デッキ').innerText()).includes(decks[1].name));
 for(const label of ['使用デッキ','相手デッキ']){await openFilters(page);const n=report.rpc.length;await trigger(label).click();await page.getByRole('dialog',{name:label+'を選択',exact:true}).getByRole('button',{name:'すべて',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'決定',exact:true}).click();assert.equal(report.rpc.length,n);await apply();await compare();}
 assert.equal((await values()).myDeck,'');assert.equal((await values()).opponentDeck,'');
 await pick('使用デッキ',decks[1]);await pick('相手デッキ',decks[2]);await quick('直近7日');assert.equal((await values()).myDeck,decks[1].id);assert.equal((await values()).opponentDeck,decks[2].id);
 await page.getByRole('button',{name:/登録者のランク/}).click();await page.locator('dialog input[value="unranked"]').uncheck();await page.getByRole('button',{name:'適用',exact:true}).click();await settle();assert.equal((await values()).myDeck,decks[1].id);assert.equal(new URL(page.url()).searchParams.get('opponentDeck'),decks[2].id);
 await page.getByLabel('開始日時の日付',{exact:true}).fill('2026-10-15');assert.equal((await values()).myDeck,decks[1].id);await apply();await compare();
 const previous=page.url();await page.locator('nav a[href="/analysis"]').click();await page.waitForURL(origin+'/analysis');await settle();assert.equal((await values()).myDeck,'');
 await page.goBack({waitUntil:'networkidle'});await settle();assert.equal(page.url(),previous);assert.equal((await values()).myDeck,decks[1].id);assert.equal((await values()).opponentDeck,decks[2].id);
 await page.goForward({waitUntil:'networkidle'});await settle();assert.equal((await values()).myDeck,'');
 await go('?myDeck='+decks[1].id+'&opponentDeck='+decks[2].id+'&scope=all&winRateMode=combined');assert.ok((await trigger('使用デッキ').innerText()).includes(decks[1].name));const reset=page.getByRole('link',{name:'リセット',exact:true}),resetUrl=new URL(await reset.getAttribute('href'),origin).href;await reset.click();await page.waitForURL(resetUrl);await page.waitForLoadState('networkidle');await settle();assert.equal((await values()).myDeck,'');assert.equal((await values()).opponentDeck,'');assert.equal((await values()).scope,'all');
 // Obsolete response cannot overwrite a newer history selection, or a subsequent unsaved draft.
 setDelay(700);await quickStart();setDelay(0);await page.evaluate(id=>{history.pushState(history.state,'','/analysis?myDeck='+id);dispatchEvent(new PopStateEvent('popstate'));},decks[1].id);await settle();await pick('使用デッキ',decks[2]);await page.waitForTimeout(850);assert.equal((await values()).myDeck,decks[2].id);assert.equal(new URL(page.url()).searchParams.get('myDeck'),decks[1].id);assert.ok((await trigger('使用デッキ').innerText()).includes(decks[2].name));
 async function quickStart(){await openFilters(page);await page.getByRole('button',{name:'直近7日',exact:true}).click();await page.waitForFunction(()=>document.querySelector('form[action="/analysis"]')?.getAttribute('aria-busy')==='true');}
 for(const width of [320,390,768,1152,1920]){await page.setViewportSize({width,height:844});await trigger('使用デッキ').click();const d=page.getByRole('dialog',{name:'使用デッキを選択',exact:true});const box=await d.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=844);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/screenshots/analysis-popup-'+width+'.png'});await page.keyboard.press('Escape');assert.ok(await trigger('使用デッキ').evaluate(e=>document.activeElement===e));}
 await page.setViewportSize({width:1440,height:1000});check('deck pickers: ID/FormData/visible labels agree; draft only, same ID, all/one/both, Apply, reload/direct URL/history/reset, ranks/periods, stale responses, five widths, zero extra RPC');
};
