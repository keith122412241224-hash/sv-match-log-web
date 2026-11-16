/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),sharp=require('sharp');
async function verify({page,report,out,h,login,origin,exportMatrix,setDecks}){
  report.layouts=[];report.exports=[];
  await login(h.MEMBER);
  async function go(count,scope,width){
    const decks=[...h.decks,...Array.from({length:Math.max(0,count-h.decks.length)},(_,i)=>({...h.decks[i%h.decks.length],id:h.uuid(8000+i),name:i===0?'非常に長いデッキ名を折り返して表示するテスト':i===1?'LongUnbrokenDeckNameWithoutSpaces':'表示デッキ'+(i+1)}))].slice(0,count);
    setDecks(decks);await page.setViewportSize({width,height:1000});
    await page.goto(origin+'/matrix?scope='+scope,{waitUntil:'networkidle'});
    await page.locator('tbody td').first().waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('tbody tr').count(),count);
    assert.deepEqual(await page.locator('thead th:not(:first-child)').allTextContents(),decks.map(d=>d.name));
    assert.deepEqual(await page.locator('tbody th').allTextContents(),decks.map(d=>d.name));
  }
  async function inspect(count,scope,width){
    const info=await page.locator('.matrix-scrollbar').evaluate(n=>{
      const failures=[];
      for(const cell of n.querySelectorAll('th,td')){
        const bounds=cell.getBoundingClientRect(),walk=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
        while(walk.nextNode()){
          if(!walk.currentNode.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(walk.currentNode);
          for(const r of range.getClientRects())if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1)failures.push('text: '+walk.currentNode.textContent);
        }
        for(const img of cell.querySelectorAll('img')){
          const r=img.getBoundingClientRect(),size=cell.closest('thead')?26:24;
          if(r.width!==size||r.height!==size||r.left<bounds.left||r.right>bounds.right)failures.push({icon:img.alt,width:r.width,height:r.height,left:r.left,right:r.right,cellLeft:bounds.left,cellRight:bounds.right,size});
        }
      }
      return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,available:n.clientWidth,content:n.scrollWidth,cell:n.querySelector('td').getBoundingClientRect().width,label:n.querySelector('tbody th').getBoundingClientRect().width,rateFont:getComputedStyle(n.querySelector('td .text-lg')).fontSize,countFont:getComputedStyle(n.querySelector('td .text-lg + span')).fontSize,failures};
    });
    assert.deepEqual(info.failures,[]);assert.ok(info.pageWidth<=width,'only matrix scrolls, never the whole page');
    assert.equal(info.rateFont,'18px');assert.equal(info.countFont,'12px');
    if(width>=1100&&count<=10||width===1080&&count<=9)assert.ok(info.content<=info.available+1,`${width}px / ${count} decks should fit: ${JSON.stringify(info)}`);
    else if(width<1024||count>=20){assert.ok(info.content>info.available);await page.locator('.matrix-scrollbar').evaluate(n=>{n.scrollLeft=n.scrollWidth;});assert.ok(await page.locator('.matrix-scrollbar').evaluate(n=>n.scrollLeft>0));await page.locator('.matrix-scrollbar').evaluate(n=>{n.scrollLeft=0;});}
    report.layouts.push({count,scope,...info});
    return page.locator('tbody td').evaluateAll(es=>es.map(e=>({text:e.textContent,color:getComputedStyle(e).backgroundColor})));
  }
  async function png(label){
    const box=await page.locator('.matrix-scrollbar > div').evaluate(n=>{
      const b=n.getBoundingClientRect();return {width:n.clientWidth,height:n.clientHeight,cells:[...n.querySelectorAll('td')].map(c=>{const r=c.getBoundingClientRect();return{x:Math.round((r.left-b.left+3)*2),y:Math.round((r.top-b.top+3)*2),color:getComputedStyle(c).backgroundColor};})};
    });
    await exportMatrix(label);
    const file=out+'/'+label+'.png',meta=await sharp(file).metadata(),{data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(meta.width,box.width*2);assert.equal(meta.height,box.height*2);
    for(const c of box.cells){const rgb=c.color.match(/\d+/g).slice(0,3).map(Number),offset=(c.y*info.width+c.x)*info.channels;assert.deepEqual([...data.subarray(offset,offset+3)],rgb,'every cell color is painted in its expected PNG position');}
    report.exports.push({label,width:meta.width,height:meta.height});
  }
  for(const scope of ['all','mine'])for(const count of [8,9,10]){
    let signature;
    for(const width of [1080,1100,1440,1920]){
      await go(count,scope,width);const next=await inspect(count,scope,width);
      if(signature)assert.deepEqual(next,signature,'resizing keeps rates/counts/colors exact');else signature=next;
      if(count===10&&[1100,1920].includes(width)){
        await page.screenshot({path:out+'/'+scope+'-'+width+'-10.png',fullPage:true});
        await png('export-'+scope+'-'+width+'-10');
      }
    }
  }
  for(const scope of ['all','mine'])for(const width of [320,390,768]){
    await go(10,scope,width);await inspect(10,scope,width);
    if(width===390){await page.screenshot({path:out+'/'+scope+'-390-10.png',fullPage:true});await png('export-'+scope+'-390-10');}
  }
  await go(20,'all',1100);await inspect(20,'all',1100);await png('export-all-1100-20');
  const widths=report.layouts.filter(l=>l.scope==='all'&&l.count===10&&l.viewport>=1100).map(l=>l.available);
  assert.ok(widths[0]<widths[1]&&widths[1]<widths[2],'wide monitors gain actual matrix space');
  report.checks.push('31 responsive cases, both scopes, exact text/icon bounds, unchanged rate/count/color signatures, scroll containment, seven complete PNG exports');
}
module.exports={verify};
