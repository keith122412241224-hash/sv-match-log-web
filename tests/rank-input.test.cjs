/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateMatchRank,EMPTY_RANK}=require('../src/lib/match-rank');
const {identifyGuestMatches,removeImportedGuestMatches}=require('../src/lib/guest-storage');
const valid=[{...EMPTY_RANK},...['beginner','d','c','b','a','aa'].map(rank_tier=>({...EMPTY_RANK,rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({...EMPTY_RANK,rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({...EMPTY_RANK,rank_tier:'grandmaster',grandmaster_rating}))];
for(const row of valid)test('rank validation accepts '+JSON.stringify(row),()=>assert.deepEqual(validateMatchRank(row),{ok:true,value:row}));
test('missing/empty form inputs preserve all NULL, never GrandMaster none',()=>{
 for(const row of [{},{rank_tier:''},{rank_tier:null},{rank_tier:'',master_group:'',grandmaster_rating:''}])assert.deepEqual(validateMatchRank(row),{ok:true,value:EMPTY_RANK});
 assert.notDeepEqual(validateMatchRank({rank_tier:'grandmaster',grandmaster_rating:'none'}).value,EMPTY_RANK);
});
test('all 704 combinations have exactly 17 valid triples, including unknown values',()=>{
 let accepted=0,rejected=0;
 for(const rank_tier of [null,'beginner','d','c','b','a','aa','master','grandmaster','unknown',false])
 for(const master_group of [null,'emerald','topaz','ruby','sapphire','diamond','unknown',42])
 for(const grandmaster_rating of [null,'none','epic','ultimate','legend','beyond','unknown',42]){
 const input={rank_tier,master_group,grandmaster_rating};const result=validateMatchRank(input);
 const normalized={...input,rank_tier:rank_tier===''?null:rank_tier};
 const expected=valid.some(v=>JSON.stringify(v)===JSON.stringify(normalized));assert.equal(result.ok,expected,JSON.stringify(input));if(result.ok)accepted++;else rejected++;
 }
 // Empty form inputs are covered separately.
 assert.equal(accepted,17);assert.equal(rejected,687);
});
test('objects, files, arrays, whitespace, uppercase and incomplete values are rejected',()=>{
 for(const input of [{rank_tier:'master'},{rank_tier:'grandmaster'},{master_group:'ruby'},{grandmaster_rating:'none'},{rank_tier:'Master'},{rank_tier:' '},{rank_tier:[]},{rank_tier:{}},{rank_tier:0},{rank_tier:new Blob(['master'])},{rank_tier:'beginner',master_group:'ruby'}])assert.equal(validateMatchRank(input).ok,false);
});
test('rank-only concurrent guest edits survive acknowledged import; legacy IDs still added',()=>{
 const before=identifyGuestMatches(JSON.stringify([{result:'win'},{local_id:'old',result:'lose',...valid.at(-1)}]),()=> 'generated');const rows=JSON.parse(before);
 const changed=[{...rows[0],rank_tier:'master',master_group:'ruby',grandmaster_rating:null},rows[1]];
 assert.deepEqual(JSON.parse(removeImportedGuestMatches(JSON.stringify(changed),before,rows.map(r=>r.local_id))),[changed[0]]);
});
