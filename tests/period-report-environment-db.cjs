/* eslint-disable @typescript-eslint/no-require-imports */
// Fresh in-memory database per caller. No connection string or external service.
const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADMIN=uuid(1),MEMBER=uuid(2),OTHER=uuid(3),NEW=uuid(100),OLD=uuid(101),EMPTY=uuid(102);
const environments=[
 {id:NEW,name:'新環境（能力調整後〜・長い環境名の表示確認）',allow_match_input:true,start_date:'2026-09-29',match_input_start_at:'2026-09-29T08:00:00Z',match_input_end_at:null,created_at:'2026-09-28T00:00:00Z'},
 {id:OLD,name:'過去環境（入力受付終了）',allow_match_input:false,start_date:'2026-08-27',match_input_start_at:null,match_input_end_at:'2026-09-29T08:00:00Z',created_at:'2026-08-26T00:00:00Z'},
 {id:EMPTY,name:'戦績のない環境',allow_match_input:false,start_date:null,match_input_start_at:null,match_input_end_at:null,created_at:'2026-08-25T00:00:00Z'}
];
const decks=[{id:uuid(200),name:'デッキA',class_name:'エルフ',is_active:true},{id:uuid(201),name:'デッキB',class_name:'ロイヤル',is_active:true}];
const read=f=>fs.readFileSync(f,'utf8').replaceAll('\r\n','\n');
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_period_report_environment_filter.sql'));
const sql=read('supabase/migrations/'+migration);
const environmentSql=read('supabase/migrations/20261001080455_environment_dashboard_aggregates_v3.sql');
async function createDb(){
 const db=await PGlite.create();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth,public,private to anon,authenticated,service_role;
 create table public.admin_users(user_id uuid primary key);
 create function public.is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
 create table public.environments(id uuid primary key,name text,start_date date,created_at timestamptz,allow_match_input boolean,match_input_start_at timestamptz,match_input_end_at timestamptz);
 create table public.deck_archetypes(id uuid primary key,name text,class_name text,is_active boolean);
 create table public.matches(id uuid primary key,user_id uuid,environment_id uuid references public.environments,
 my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result text,played_at timestamptz not null,
 rank_tier text,master_group text,grandmaster_rating text);
 alter table public.matches enable row level security;
 create policy matches_select_own_or_admin on public.matches for select to authenticated using(auth.uid()=user_id or public.is_admin());
 alter table public.environments enable row level security;
 create policy environments_select_public on public.environments for select to anon,authenticated using(true);
 grant select on public.matches,public.environments,public.deck_archetypes to authenticated;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 await db.query('insert into public.admin_users values($1)',[ADMIN]);
 for(const [table,rows] of [['environments',environments],['deck_archetypes',decks]])await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(rows)]);
 await db.exec(read('supabase/legacy-migrations/pre-baseline/014_period_report_aggregates_v1.sql'));
 await db.exec(read('supabase/legacy-migrations/pre-baseline/018_period_report_rank_aggregates_v2.sql'));
 await db.exec(environmentSql);
 await db.exec(sql);
 return db;
}
async function identity(db,id=ADMIN,role='authenticated'){
 if(!['authenticated','anon','service_role'].includes(role))throw Error('Unexpected test role');
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id||'',JSON.stringify({sub:id,is_anonymous:false})]);
 await db.exec('set role '+role);
}
async function seed(db,rows){await db.exec('reset role;truncate public.matches');await db.query('insert into public.matches select * from jsonb_populate_recordset(null::public.matches,$1::jsonb)',[JSON.stringify(rows)]);await identity(db);}
const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
let serial=1000;
const row=(extra={})=>({id:uuid(++serial),user_id:MEMBER,environment_id:NEW,my_deck_id:decks[0].id,opponent_deck_id:decks[1].id,my_archetype_id:decks[0].id,opponent_archetype_id:decks[1].id,result:'win',played_at:'2026-09-29T01:00:00.000Z',rank_tier:null,master_group:null,grandmaster_rating:null,...extra});
const accepts=(m,f)=>{if(f==null||f==='all')return true;if(f==='master-plus')return ['master','grandmaster'].includes(m.rank_tier);const[t,c]=f.split(':');return m.rank_tier===t&&(!c||(t==='master'?m.master_group:m.grandmaster_rating)===c);};
module.exports={createDb,identity,seed,row,ranks,accepts,uuid,ADMIN,MEMBER,OTHER,NEW,OLD,EMPTY,environments,decks,sql,environmentSql};
