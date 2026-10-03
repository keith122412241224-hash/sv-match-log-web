/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {promisify}=require('node:util'),exec=promisify(cp.execFile);
const {chromium}=require('../build/r1b-rank-compatibility/tools/node_modules/playwright');
const old=require('./fixtures/weekly-report-e430a56'),{withPeriodReportRank}=require('../src/lib/period-report-rank'),{withPeriodReportEnvironment}=require('../src/lib/period-report-environment'),{buildWeeklyReportPrompt}=require('../src/lib/weekly-report');
module.exports=async({root,out,keys,accounts,rows,environments,f,period,previous,report})=>{
 const proof={auth:'Real Supabase Auth, password login via application form',cases:[],viewports:[],png:0,errors:[],ai:'AI text stubbed; Supabase/Auth/PostgREST never stubbed'},trace=path.join(out,'requests.jsonl');
 fs.writeFileSync(trace,'');
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const appEnv={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:keys.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:keys.ANON_KEY,OPENAI_API_KEY:'synthetic-not-sent',PERIOD_REAL_TRACE:trace};
 const build=async(legacy)=>{
  const dir=path.join(out,(legacy?'old-app-':'app-')+Date.now());fs.mkdirSync(dir);
  if(legacy){for(const file of cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','src'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),cp.execFileSync('git',['show','HEAD:'+file],{cwd:root}));}}
  else fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});
  fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  for(const file of ['package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','next.config.mjs','postcss.config.mjs','tailwind.config.ts'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(dir,file));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'junction');
  const source=[];const walk=p=>{for(const e of fs.readdirSync(path.join(dir,p),{withFileTypes:true})){const f=path.posix.join(p,e.name);if(e.isDirectory())walk(f);else source.push(f);}};walk('src');
  if(!legacy)for(const file of source)assert.equal(hash(path.join(dir,file)),hash(path.join(root,file)));
  assert.equal(hash(path.join(dir,'package-lock.json')),hash(path.join(root,'package-lock.json')));
  proof[legacy?'oldBuild':'newBuild']={directory:path.relative(root,dir),sourceFiles:source.length,sourceHashes:Object.fromEntries(source.map(f=>[f,hash(path.join(dir,f))])),lockfile:hash(path.join(dir,'package-lock.json'))};
  const built=await exec(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{cwd:dir,env:appEnv,windowsHide:true,maxBuffer:8e6,timeout:180000});fs.writeFileSync(path.join(out,legacy?'old-build.log':'build.log'),built.stdout+built.stderr);
  return dir;
 };
 const dir=await build(false);console.log('New app built from byte-identical source/lockfile.');
 let app,browser,log;
 const start=async(dir,port)=>{log=fs.openSync(path.join(out,'server-'+port+'.log'),'w');app=cp.spawn(process.execPath,['--require',path.join(root,'tests/period-report-real-network.cjs'),require.resolve('next/dist/bin/next'),'start',dir,'-p',String(port)],{env:appEnv,windowsHide:true,stdio:['ignore',log,log]});for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port+'/login')).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Application did not start');};
 const stop=()=>{if(app)app.kill();if(log!==undefined)fs.closeSync(log);app=null;log=undefined;};
 const oracle=(env,rank='all')=>{const matching=(p)=>rows.filter(r=>Date.parse(r.played_at)>=Date.parse(p.startIso)&&Date.parse(r.played_at)<=Date.parse(p.endIso)&&(!env||r.environment_id===env)&&f.accepts(r,rank)).sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));return withPeriodReportEnvironment(withPeriodReportRank(old.buildWeeklyReport(matching(period),matching(previous),f.decks,period),rank),environments.find(e=>e.id===env)||null).aiJson;};
 const rpcCalls=()=>fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(x=>x.kind==='rpc'&&x.path.includes('get_period_report_aggregates'));
 const route='/admin/weekly-report?start=2026-09-29&end=2026-10-02';
 try{
  await start(dir,3266);browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--remote-debugging-port=9366']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>proof.errors.push(e.message));
  const login=async(account,port=3266)=>{await context.clearCookies();await page.goto('http://localhost:'+port+'/login',{waitUntil:'networkidle'});const form=page.locator('form').filter({has:page.getByRole('button',{name:'ログイン',exact:true})});await form.locator('[name=email]').fill(account.email);await form.locator('[name=password]').fill(account.password);await form.getByRole('button',{name:'ログイン',exact:true}).click();await page.waitForURL('http://localhost:'+port+'/',{timeout:20000});};
  await login(accounts[0]);await page.goto('http://localhost:3266'+route,{waitUntil:'networkidle'});
  const agent=path.join(root,'build/environment-schedule-step2/browser-tools/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'),agentEnv={...process.env,AGENT_BROWSER_SOCKET_DIR:path.join(out,'agent-sockets')};
  const snap=await exec(agent,['--session','period-real','--cdp','9366','snapshot','-i'],{env:agentEnv,windowsHide:true,timeout:30000});fs.writeFileSync(path.join(out,'agent-browser.txt'),snap.stdout);assert.match(snap.stdout,/環境/);
  const readJson=async()=>JSON.parse(await page.locator('textarea[readonly]').first().inputValue());
  for(const env of [undefined,'all',f.NEW,f.OLD,f.EMPTY,f.uuid(103)])for(const rank of ['all','master:sapphire','grandmaster:none']){
   const before=rpcCalls().length;await page.goto('http://localhost:3266'+route+(env?'&environment='+env:'')+'&rank='+rank,{waitUntil:'networkidle'});const selected=env&&env!=='all'?env:null;
   assert.deepEqual(await readJson(),oracle(selected,rank));const calls=rpcCalls();assert.equal(calls.length,before+1);assert.equal(calls.at(-1).path.split('_').at(-1),selected?'v3':rank==='all'?'v1':'v2');if(selected)assert.equal(calls.at(-1).args.p_environment_id,selected);
   proof.cases.push({environment:selected===f.NEW?'new':selected===f.OLD?'old':selected===f.EMPTY?'empty':selected?'noPrevious':env??'unspecified',rank,total:(await readJson()).summary.totalMatches});
  }
  await page.goto('http://localhost:3266'+route+'&environment='+f.NEW,{waitUntil:'networkidle'});
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'viewport-'+width+'.png')});proof.viewports.push(width);}
  await page.setViewportSize({width:1440,height:1000});
  const blocks=page.locator('section').filter({has:page.getByRole('button',{name:'PNG',exact:true})});assert.equal(await blocks.count(),6);
  const context=page.locator('p').filter({hasText:/^対象期間：/});assert.equal(await context.count(),1);assert.ok((await context.innerText()).includes(environments[0].name));assert.ok((await context.innerText()).includes('2026/9/29〜10/2'));
  for(let i=0;i<6;i++){const text=await blocks.nth(i).locator(':scope > div').last().innerText();assert.doesNotMatch(text,/対象期間：|JST・各日終日/);const download=page.waitForEvent('download');await blocks.nth(i).getByRole('button',{name:'PNG',exact:true}).click();await (await download).saveAs(path.join(out,'export-'+i+'.png'));assert.equal(fs.readFileSync(path.join(out,'export-'+i+'.png')).subarray(1,4).toString(),'PNG');proof.png++;}
  await page.getByRole('button',{name:'AI用プロンプトをコピー',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replaceAll('\r\n','\n'),buildWeeklyReportPrompt(await readJson()));
  const tier=page.locator('section').filter({has:page.getByRole('heading',{name:'Tier手動調整',exact:true})});
  const oldDefault=oracle(f.OLD).tierCandidates[0].finalTier,override=oldDefault==='Tier1'?'Tier2':'Tier1';await tier.locator('select').first().selectOption(override);
  const memo=page.locator('section').filter({has:page.getByRole('heading',{name:'運営者メモ',exact:true})}).locator('textarea');await memo.fill('環境切替で消える検証用メモ');
  await page.getByRole('button',{name:'AI本文生成',exact:true}).click();await page.getByRole('button',{name:'本文コピー',exact:true}).waitFor();
  const markdown=await page.locator('textarea[readonly]').last().inputValue();assert.ok(markdown.includes(environments[0].name));const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Markdown保存',exact:true}).click();await(await downloading).saveAs(path.join(out,'report.md'));assert.equal(fs.readFileSync(path.join(out,'report.md'),'utf8'),markdown);
  await page.locator('select[name=environment]').selectOption(f.OLD);await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');assert.deepEqual(await readJson(),oracle(f.OLD));assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0);
  assert.equal(await tier.locator('select').first().inputValue(),oldDefault);assert.equal(await memo.inputValue(),'');proof.environmentSwitchResets=true;
  await page.goto('http://localhost:3266'+route+'&environment='+f.uuid(103),{waitUntil:'networkidle'});assert.equal((await readJson()).summary.matchDelta,null);assert.match(await page.locator('main').innerText(),/比較対象なし/);
  for(const invalid of ['', 'bad',f.uuid(999),'all&environment='+f.NEW]){const before=rpcCalls().length;await page.goto('http://localhost:3266'+route+'&environment='+invalid,{waitUntil:'networkidle'});assert.equal(await page.locator('textarea[readonly]').count(),0);assert.equal(rpcCalls().length,before);}
  await login(accounts[1]);const before=rpcCalls().length;await page.goto('http://localhost:3266'+route+'&environment='+f.NEW,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/');assert.equal(rpcCalls().length,before);proof.memberDenied=true;
  await context.clearCookies();await page.goto('http://localhost:3266'+route+'&environment='+f.NEW,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('textarea[readonly]').count(),0);assert.equal(rpcCalls().length,before);assert.ok(await page.locator('a[href="/login"]').count()>0);proof.unauthenticatedDenied=true;
  stop();const legacy=await build(true);await start(legacy,3267);await login(accounts[0],3267);
  for(const rank of ['all','master:sapphire']){await page.goto('http://localhost:3267'+route+'&rank='+rank,{waitUntil:'networkidle'});assert.deepEqual(await readJson(),oracle(null,rank));assert.ok(!rpcCalls().at(-1).path.endsWith('v3'));}
  proof.oldAppAgainstNewDb=true;assert.deepEqual(proof.errors,[]);proof.passed=true;
  await exec(agent,['--session','period-real','close'],{env:agentEnv,windowsHide:true,timeout:10000}).catch(()=>{});
  console.log('Real login browser: 18 cases, 6 PNG, Markdown/AI input, switch reset, member/unauthenticated denial, old app compatibility passed.');
 }finally{if(browser)await browser.close();stop();fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(proof,null,2));report.browser=proof;}
};
