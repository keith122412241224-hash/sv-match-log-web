/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({page, files, report, out}) => {
  const results = [];
  for (const count of [1, 5]) {
    const calls = [];
    const listener = async response => {
      if (response.url().endsWith('/admin/creator/api') && response.request().method() === 'POST') calls.push({status:response.status(),timing:response.request().timing(),stages:response.headers()['server-timing']});
    };
    page.on('response', listener);
    await page.evaluate(() => performance.clearResourceTimings());
    await page.evaluate(count => {
      window.__uploadPerf = {selected:0,saved:0};
      document.querySelector('[aria-label="画像アップロード"]').addEventListener('change',()=>{window.__uploadPerf.selected=performance.now();},{once:true});
      const observer = new MutationObserver(()=>{ if ([...document.querySelectorAll('[role="status"]')].some(n=>n.textContent.includes(`${count}枚の画像を保存`))) {window.__uploadPerf.saved=performance.now();observer.disconnect();} });
      observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    },count);
    const start = performance.now();
    await page.getByLabel('画像アップロード').setInputFiles(Array.from({length:count},(_,i)=>({...files[i % files.length],name:`perf-${count}-${i}.`+files[i % files.length].name.split('.').pop()})));
    await page.getByRole('status').filter({hasText:`${count}枚の画像を保存`}).waitFor();
    const visible = performance.now();
    await page.locator('[aria-label="画像ライブラリ"] img').evaluateAll(imgs => Promise.all(imgs.map(img=>img.decode())));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const rendered = performance.now();
    const resources = await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.endsWith('/admin/creator/api')).map(e=>({duration:e.duration,uploadToFirstByte:e.responseStart-e.requestStart,bodyDownload:e.responseEnd-e.responseStart,server:e.serverTiming.map(t=>({name:t.name,duration:t.duration}))})));
    page.off('response',listener);
    const browser = await page.evaluate(()=>{const r=performance.getEntriesByType('resource').filter(e=>e.name.endsWith('/admin/creator/api'));return {...window.__uploadPerf,firstRequest:r[0]?.startTime,lastResponse:Math.max(...r.map(e=>e.responseEnd))};});
    results.push({count,totalMs:rendered-start,savedMs:visible-start,imageAndPaintMs:rendered-visible,browser,totalBrowserMs:browser.saved-browser.selected,browserPreparationMs:browser.firstRequest-browser.selected,finalRerenderMs:browser.saved-browser.lastResponse,resources,calls});
  }
  report.performance = results;
  fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify({environment:'Loopback Next production build + PGlite + in-memory Auth/Storage transport; not production network measurements',results},null,2));
  console.log(JSON.stringify(results,null,2));
};
