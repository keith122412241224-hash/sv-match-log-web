/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {parseDeckSelection,normalizeDeckSelection,canonicalDeckQuery,DeckSelectionError,MAX_ANALYSIS_DECKS}=require('../src/lib/analysis-deck-selection');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const decks=[{id:id(2),class_name:'ロイヤル'},{id:id(1),class_name:'エルフ'},{id:id(3),class_name:'エルフ'}];
test('deck URL: legacy/all, stable class/catalog order, duplicates, one-item canonical URL',()=>{
 assert.equal(parseDeckSelection(undefined,undefined,decks),null);assert.equal(parseDeckSelection('',undefined,decks),null);
 assert.deepEqual(parseDeckSelection(id(1),undefined,decks),[id(1)]);
 assert.deepEqual(parseDeckSelection(undefined,[id(2),id(1),id(2),id(3)].join(','),decks),[id(1),id(3),id(2)]);
 const a=canonicalDeckQuery(new URLSearchParams({myDeckIds:[id(2),id(1),id(2)].join(','),opponentDeck:''}),decks),b=canonicalDeckQuery(new URLSearchParams({myDeckIds:[id(1),id(2)].join(',')}),decks);assert.equal(a.toString(),b.toString());
 assert.equal(canonicalDeckQuery(new URLSearchParams({myDeckIds:id(1)}),decks).get('myDeck'),id(1));
});
test('deck URL: explicit empty, wrong type, null member, multidimensional, malformed/unknown/conflicting/repeated and excessive IDs fail closed',()=>{
 for(const value of [[],[null],[[id(1)]],['bogus'],[id(9)],Array(MAX_ANALYSIS_DECKS+1).fill(id(1)),{},undefined])assert.throws(()=>normalizeDeckSelection(value,decks),DeckSelectionError);
 for(const q of ['myDeckIds=','myDeck=bad','myDeckIds='+id(9),'myDeck='+id(1)+'&myDeckIds='+id(2),'myDeck=&myDeckIds='+id(2),'myDeck='+id(1)+'&myDeck='+id(1),'myDeckIds='+id(1)+'&myDeckIds='+id(1),'myDeckIds='+id(1)+','])assert.throws(()=>canonicalDeckQuery(new URLSearchParams(q),decks),DeckSelectionError);
 assert.throws(()=>parseDeckSelection([id(1)],undefined,decks),DeckSelectionError);
 const all=Array.from({length:60},(_,i)=>({id:id(i)})),q=canonicalDeckQuery(new URLSearchParams({myDeckIds:all.map(d=>d.id).join(','),opponentDeckIds:all.map(d=>d.id).join(',')}),all);assert.ok(q.toString().length<5000);assert.equal(normalizeDeckSelection(all.map(d=>d.id),all).length,60);
});
test('analysis multi scope: exact allowed files and hashes; every unrelated product/SQL/dependency byte unchanged',()=>{
 const s=require('./analysis-deck-multi-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).replaceAll('\r\n','\n');
 const expected=['src/components/DeckSelectDialog.tsx','src/components/DeckMultiSelectDialog.tsx','src/components/analysis/AnalysisFilters.tsx','src/components/analysis/AnalysisDashboard.tsx','src/lib/analysis-deck-selection.ts','src/lib/analysis-data.ts','src/lib/analysis-page-data.ts','src/app/analysis/page.tsx','src/app/api/analysis/route.ts','supabase/migrations/20261022050000_analysis_deck_sets.sql'];
 assert.deepEqual(Object.keys(s.hashes).sort(),expected.sort());for(const f of expected)s.assertReviewed(f);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeMulti(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
