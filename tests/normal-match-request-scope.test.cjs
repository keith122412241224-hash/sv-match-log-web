/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const {base,hashes,added,read,readBeforeNormalRequest}=require('./normal-match-request-scope.cjs');
test('normal request fix preserves all previous SQL, guest imports, admin RLS, aggregation, creator and dependencies',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),[...added,'src/app/actions.ts','src/types/database.ts','src/components/matches/QuickMatchForm.tsx','src/components/matches/ScheduledMatchForm.tsx'].sort());
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,file);
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeNormalRequest(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
 const current=read('src/app/actions.ts'),old=git(['show',base+':src/app/actions.ts']);
 const guest=s=>s.slice(s.indexOf('export async function importGuestMatches'),s.indexOf('async function saveMatchFromForm'));
 assert.equal(guest(current),guest(old),'Guest import implementation preserved byte-for-byte');
});
