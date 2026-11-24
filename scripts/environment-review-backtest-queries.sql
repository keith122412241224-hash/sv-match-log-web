-- Administrator read-only historical export. Results exclude account and match IDs.
-- Use psql integer variables after checking the environment catalog.
-- Fixed exclusive end 2026-11-24 00:00 JST. Each statement returns JSON aggregates.

-- review-historical-meta.json (whole object)
with e as (select row_number() over(order by start_date) i, *
  from public.environments),
d as (
  select row_number() over(order by a.id) i,a.id,a.name,a.class_name,a.is_other,a.created_at,e.i ei
  from public.deck_archetypes a
  left join e on a.environment_id=e.id)
select (select json_agg(json_build_array(i, id, name,start_date,match_input_start_at,dashboard_end_at) order by i) from e) env,(select json_agg(json_build_array(i,id,name,class_name,is_other,created_at,ei) order by i) from d) catalog;

-- hcells-ENV-FIRST.json (rows property; null becomes [])
with e as (select row_number() over(order by start_date) i,*
  from public.environments),
d as (
  select row_number() over(order by id) i,*
  from public.deck_archetypes),
src as (
  select e.i ei,(m.played_at at time zone 'Asia/Tokyo')::date-e.start_date as day,(m.created_at at time zone 'Asia/Tokyo')::date-e.start_date recorded, a.i my,b.i opp, case when m.rank_tier is null then 'unranked' when m.rank_tier='master' then 'master:'||m.master_group when m.rank_tier='grandmaster' then 'grandmaster:'||m.grandmaster_rating else m.rank_tier end as rank,m.turn_order='first' as first,m.result='win' win, (m.my_archetype_id is null and m.my_deck_id is not null)::int + 2*(m.opponent_archetype_id is null and m.opponent_deck_id is not null)::int fallback
  from public.matches m join e on e.id=m.environment_id
  left join d a on a.id=m.my_archetype_id and (a.environment_id is null or a.environment_id=e.id)
  left join d b on b.id=m.opponent_archetype_id and (b.environment_id is null or b.environment_id=e.id)
  where m.played_at>=coalesce(e.match_input_start_at,e.start_date::timestamp at time zone 'Asia/Tokyo') and m.played_at<least(coalesce(e.dashboard_end_at,'infinity'), timestamptz '2026-11-24 00:00+09') and m.created_at<timestamptz '2026-11-24 00:00+09'),
g as (
  select ei,day,recorded,my,opp,rank,first,fallback,count(*) total,
    count(*) filter(where win) wins from src
  group by 1,2,3,4,5,6,7,8)
select json_agg(json_build_array(day,recorded,my,opp,rank,first,fallback,total,wins) order by day,recorded,my,opp,rank,first,fallback) rows from g where ei=:env_no and day >=:first_day and day <:exclusive_end_day;

-- hbias-ENV-FIRST_CUTOFF.json (cuts, rows and totals; cuts = supplied offsets)
with e as (select row_number() over(order by start_date) i,*
  from public.environments),
d as (
  select row_number() over(order by id) i,*
  from public.deck_archetypes),
cuts as (
  select e.*,k,t.cutoff from e
  cross join unnest(array[:cutoff_offsets]::int[]) k
  cross join lateral(select (e.start_date+k)::timestamp at time zone 'Asia/Tokyo' as cutoff) t
  where e.i=:env_no and t.cutoff<=least(coalesce(e.dashboard_end_at,'infinity'),timestamptz '2026-11-24 00:00+09')),
src as (
  select c.k,a.i my,b.i opp,a.is_other myother,b.is_other oppother,m.result='win' won,m.rank_tier='grandmaster' upperrank,m.user_id from cuts c join public.matches m on m.environment_id=c.id
  left join d a on a.id=m.my_archetype_id and a.created_at<c.cutoff and (a.environment_id is null or a.environment_id=c.id)
  left join d b on b.id=m.opponent_archetype_id and b.created_at<c.cutoff and (b.environment_id is null or b.environment_id=c.id)
  where m.played_at>=greatest(c.cutoff-interval '7 days',coalesce(c.match_input_start_at,c.start_date::timestamp at time zone 'Asia/Tokyo')) and m.played_at<c.cutoff and m.created_at<c.cutoff),
v as (
  select s.k,s.user_id,x.* from src s
  cross join lateral (values(s.my,null::bigint,'d',s.won,true),(s.opp,null::bigint,'d',not s.won,false),(least(s.my,s.opp),greatest(s.my,s.opp),'p',case when s.my<s.opp then s.won else not s.won end,s.my<s.opp)) as x(a,b,kind,win,pilot)
  where x.a is not null and (x.kind='d' or s.my<>s.opp)),
el as (
  select s.k,s.user_id,x.*,s.upperrank from src s
  cross join lateral (values(s.my,null::bigint,'e',s.won,true),(s.opp,null::bigint,'e',not s.won,false),(least(s.my,s.opp),greatest(s.my,s.opp),'q',case when s.my<s.opp then s.won else not s.won end,s.my<s.opp)) as x(a,b,kind,win,pilot)
  where s.my<>s.opp and not s.myother and not s.oppother),
u as (
  select k,a,b,kind,user_id,count(*) n,
    count(*) filter(where win) wins,
    bool_or(pilot) pilot,
    bool_or(upperrank) up,
    bool_or(upperrank and pilot) up_pilot from (select *,false as upperrank from v union all select * from el) x
  group by 1,2,3,4,5),
ordered as (
  select *,row_number() over(partition by k,a,b,kind order by n desc,user_id) pos from u),
g as (
  select k,a,b,kind,count(*) ctr,
    count(*) filter(where pilot) pilots,
    round(100.0*max(n)/sum(n),6) conc,
    round(avg(100.0*wins/n),6) eq,
    round(100.0*sum(wins) filter(where pos>1)/nullif(sum(n) filter(where pos>1),0),6) excl,
    count(*) filter(where up) uc,
    count(*) filter(where up_pilot) up from ordered
  group by 1,2,3,4)
select json_agg(json_build_array(k,a,b,kind,ctr,pilots,conc,eq,excl,uc,up) order by k,a,b,kind) rows,(select json_agg(json_build_array(k,z) order by k) from (select k,count(distinct user_id) z from src
  group by k) q) totals from g;

-- hextra-ENV-FIRST_CUTOFF.json (rows). Uses v2's win-count tiebreak for the
-- largest contributor and measures registered non-GM contributors.
with e as (select row_number() over(order by start_date) i,*
  from public.environments),
d as (
  select row_number() over(order by id) i,*
  from public.deck_archetypes),
cuts as (
  select e.*,k,t.cutoff from e
  cross join unnest(array[:cutoff_offsets]::int[]) k
  cross join lateral(select (e.start_date+k)::timestamp at time zone 'Asia/Tokyo' as cutoff) t
  where e.i=:env_no and t.cutoff<=least(coalesce(e.dashboard_end_at,'infinity'),timestamptz '2026-11-24 00:00+09')),
src as (
  select c.k,a.i my,b.i opp,a.is_other myother,b.is_other oppother,m.result='win' won,m.rank_tier='grandmaster' upperrank,m.user_id from cuts c join public.matches m on m.environment_id=c.id
  left join d a on a.id=m.my_archetype_id and a.created_at<c.cutoff and (a.environment_id is null or a.environment_id=c.id)
  left join d b on b.id=m.opponent_archetype_id and b.created_at<c.cutoff and (b.environment_id is null or b.environment_id=c.id)
  where m.played_at>=greatest(c.cutoff-interval '7 days',coalesce(c.match_input_start_at,c.start_date::timestamp at time zone 'Asia/Tokyo')) and m.played_at<c.cutoff and m.created_at<c.cutoff),
v as (
  select s.k,s.user_id,x.* from src s
  cross join lateral (values(s.my,null::bigint,'d',s.won,true),(s.opp,null::bigint,'d',not s.won,false),(least(s.my,s.opp),greatest(s.my,s.opp),'p',case when s.my<s.opp then s.won else not s.won end,s.my<s.opp)) as x(a,b,kind,win,pilot)
  where x.a is not null and (x.kind='d' or s.my<>s.opp)),
el as (
  select s.k,s.user_id,x.*,s.upperrank from src s
  cross join lateral (values(s.my,null::bigint,'e',s.won,true),(s.opp,null::bigint,'e',not s.won,false),(least(s.my,s.opp),greatest(s.my,s.opp),'q',case when s.my<s.opp then s.won else not s.won end,s.my<s.opp)) as x(a,b,kind,win,pilot)
  where s.my<>s.opp and not s.myother and not s.oppother),
u as (
  select k,a,b,kind,user_id,count(*) n,
    count(*) filter(where win) wins,
    bool_or(pilot) pilot,
    bool_or(upperrank) up,
    bool_or(upperrank and pilot) up_pilot,
    bool_or(not upperrank) other_rank_user from (select *,false as upperrank from v union all select * from el) x
  group by 1,2,3,4,5),
ordered as (
  select *,row_number() over(partition by k,a,b,kind order by n desc,wins desc,user_id) pos from u),
g as (
  select k,a,b,kind,count(*) ctr,
    count(*) filter(where pilot) pilots,
    round(100.0*max(n)/sum(n),6) conc,
    round(avg(100.0*wins/n),6) eq,
    round(100.0*sum(wins) filter(where pos>1)/nullif(sum(n) filter(where pos>1),0),6) excl,
    count(*) filter(where up) uc,
    count(*) filter(where up_pilot) up,
    count(*) filter(where other_rank_user) others from ordered
  group by 1,2,3,4)
select json_agg(json_build_array(k,a,b,kind,excl,others) order by k,a,b,kind) rows,(select json_agg(json_build_array(k,z) order by k) from (select k,count(distinct user_id) z from src
  group by k) q) totals from g
  where kind in ('e','q');
