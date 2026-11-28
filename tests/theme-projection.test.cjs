/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
const theme=require('./theme-source.cjs');
const environmentReview=require('./environment-review-scope.cjs');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32e6}).trim().split('\n').filter(Boolean);
test('theme scope exactly reviews every changed/added file; DB/RPC/auth/aggregation/OBS artwork/dependencies and inventory remain intact',()=>{
  const product=f=>/^(src|supabase)\//.test(f)||/^(package(-lock)?\.json|tailwind.config.ts)$/.test(f);
  const files=git('ls-tree','-r','--name-only',theme.base).filter(product);
  for(const file of theme.changes.keys())theme.assertReviewed(file);
  for(const file of theme.publicEncounterAdded)theme.assertPublicEncounterSource(file);
  for(const file of files){
    const source=theme.readBeforeTheme(file);
    assert.equal(source,theme.gitSource(theme.base,file),file);
  }
  const googleSources = ['src/lib/auth-config.ts', 'src/lib/supabase/auth-fetch.ts'];
  assert.deepEqual(theme.historicalFiles(googleSources), []); // Verify exact added sources against their patch.
  assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard').filter(product).sort(),[...files,...theme.added,...environmentReview.added,...theme.publicEncounterAdded,...googleSources].sort());
});
test('historical projection rejects arbitrary edits to every reviewed theme file',()=>{
  for(const file of theme.changes.keys()){
    const source=fs.readFileSync(file,'utf8');
    assert.throws(()=>theme.assertReviewed(file,source+'\n/* unexpected edit */\n'),/unreviewed (?:theme|public encounter) change/);
    assert.throws(()=>theme.assertReviewed(file,source.slice(1)),/unreviewed (?:theme|public encounter) change/);
  }
  for(const file of theme.publicEncounterAdded){
    const source=fs.readFileSync(file,'utf8');
    assert.throws(()=>theme.assertPublicEncounterSource(file,source+'\n/* unexpected edit */\n'),/unreviewed public encounter change/);
    assert.throws(()=>theme.assertPublicEncounterSource(file,source.slice(1)),/unreviewed public encounter change/);
  }
});
test('historical inventory excludes only exact reviewed additions and keeps unexpected files',()=>{
  const unexpected='src/lib/unreviewed.ts';
  assert.deepEqual(theme.historicalFiles([...theme.added,...theme.publicEncounterAdded,unexpected,'src/lib/utils.ts']),[unexpected,'src/lib/utils.ts']);
  assert.deepEqual(theme.historicalFiles(['src/components/AppShell.tsx',unexpected],theme.base),[unexpected]);
  assert.deepEqual(theme.historicalFiles(['src/components/AppShell.tsx'],'938514fd94f05767aafcace87bd94c047e275973'),['src/components/AppShell.tsx']);
  assert.deepEqual(theme.historicalFiles(['src/components/environment/EnvironmentTrendChart.tsx'],'504a05ed275e3c78ccd326b3a58596b978d77c88'),['src/components/environment/EnvironmentTrendChart.tsx']);
});
test('exact patch parser rejects altered context, hunk counts and arbitrary source',()=>{
  const file='src/components/AppShell.tsx',change=theme.changes.get(file),before=theme.reviewed(file).before;
  assert.equal(theme.applyExact(before,change.section),theme.reviewed(file).after);
  assert.throws(()=>theme.applyExact('unexpected\n'+before,change.section));
  assert.throws(()=>theme.applyExact(before,change.section.replace(/@@ -\d+,\d+/, '@@ -1,99999')));
});
