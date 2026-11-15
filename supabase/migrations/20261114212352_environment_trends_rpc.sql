-- Phase 2: RPC + ACL only. Phase 1 must be committed and verified first.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
set local idle_in_transaction_session_timeout = '3s';

do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = c.relam
    where i.indexrelid = pg_catalog.to_regclass('public.matches_environment_played_at_idx')
      and i.indrelid = 'public.matches'::regclass
      and i.indisvalid and i.indisready and i.indislive
      and not i.indisunique and not i.indisexclusion
      and i.indnkeyatts = 2 and i.indnatts = 2 and am.amname = 'btree'
      and i.indpred is null and i.indexprs is null and i.indoption::text = '0 0'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'environment_id'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'played_at'
  ) then
    raise exception 'Valid environment trend index required; stop and inspect before RPC deployment';
  end if;
end;
$guard$;

create function private.get_environment_trend_aggregates_v1(
  p_environment_id uuid, p_period text, p_rank_filters text[], p_deck_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  aggregated_at timestamptz := pg_catalog.statement_timestamp();
  data_through timestamptz;
  environment_start timestamptz;
  configured_end timestamptz;
  first_day date;
  last_day date;
  scan_day date;
  allowed_ranks constant text[] := array['unranked','beginner','d','c','b','a','aa','master:emerald','master:topaz','master:ruby','master:sapphire','master:diamond','grandmaster:none','grandmaster:epic','grandmaster:ultimate','grandmaster:legend','grandmaster:beyond'];
begin
  if auth.uid() is null or (auth.jwt() -> 'is_anonymous') is distinct from 'false'::jsonb then
    raise exception 'Member authentication required' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('7d','14d','30d','all') then
    raise exception 'Invalid trend period' using errcode = '22023';
  end if;
  if p_rank_filters is null or pg_catalog.array_ndims(p_rank_filters) is distinct from 1
    or pg_catalog.cardinality(p_rank_filters) not between 1 and 17
    or exists (select 1 from pg_catalog.unnest(p_rank_filters) v where v is null or not (v = any(allowed_ranks))) then
    raise exception 'Invalid atomic rank selection' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(v order by ord) into p_rank_filters
    from pg_catalog.unnest(allowed_ranks) with ordinality a(v,ord) where v = any(p_rank_filters);
  if p_deck_ids is null or pg_catalog.array_ndims(p_deck_ids) is distinct from 1
    or pg_catalog.cardinality(p_deck_ids) not between 1 and 1000
    or exists (select 1 from pg_catalog.unnest(p_deck_ids) v(id) where v.id is null or not exists (
      select 1 from public.deck_archetypes a where a.id = v.id and a.is_active
        and (a.environment_id is null or a.environment_id = p_environment_id)
    )) then
    raise exception 'Invalid trend deck selection' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(distinct id order by id) into p_deck_ids from pg_catalog.unnest(p_deck_ids) id;

  -- Environment dates bound aggregation independently of match input scheduling.
  -- An explicit start date means JST midnight; creation time is the legacy fallback.
  select coalesce(e.start_date::timestamp at time zone 'Asia/Tokyo', e.created_at), e.dashboard_end_at
    into environment_start, configured_end from public.environments e where e.id = p_environment_id;
  if not found or environment_start is null then
    raise exception 'Invalid trend environment' using errcode = '22023';
  end if;
  -- Match the exact configured cutoff when it has been reached, even inside a 30-minute bin.
  data_through := pg_catalog.date_bin(interval '30 minutes', aggregated_at, timestamptz '1970-01-01 00:00:00+00');
  if configured_end <= aggregated_at then
    data_through := configured_end;
  end if;
  last_day := ((data_through - interval '1 microsecond') at time zone 'Asia/Tokyo')::date;
  first_day := greatest((environment_start at time zone 'Asia/Tokyo')::date,
    case p_period when '7d' then last_day - 6 when '14d' then last_day - 13 when '30d' then last_day - 29
      else (environment_start at time zone 'Asia/Tokyo')::date end);
  scan_day := greatest(first_day - 6, (environment_start at time zone 'Asia/Tokyo')::date);

  return (
    with days as (
      select scan_day + n as day from pg_catalog.generate_series(0, last_day - scan_day) n
    ), source as materialized (
      -- One bounded scan supplies the denominator; selecting decks never narrows it.
      select (m.played_at at time zone 'Asia/Tokyo')::date as day,
        m.my_archetype_id as my_key, m.opponent_archetype_id as opponent_key, m.result
      from public.matches m where m.environment_id = p_environment_id
        and m.played_at >= greatest(environment_start, scan_day::timestamp at time zone 'Asia/Tokyo')
        and m.played_at < data_through
        and (case when m.rank_tier is null then 'unranked'
          when m.rank_tier = 'master' then 'master:' || m.master_group
          when m.rank_tier = 'grandmaster' then 'grandmaster:' || m.grandmaster_rating
          else m.rank_tier end) = any(p_rank_filters)
    ), daily_totals as (
      select day, pg_catalog.count(*) as total from source group by day
    ), daily_decks as (
      select s.day, v.key,
        pg_catalog.count(*) filter (where v.side = 1) as encounters,
        pg_catalog.count(*) filter (where v.side = 0 or s.my_key is distinct from s.opponent_key) as registrations,
        pg_catalog.count(*) as evaluations, pg_catalog.count(*) filter (where v.won) as wins
      from source s cross join lateral (
        values (s.my_key,0,s.result = 'win'), (s.opponent_key,1,s.result = 'lose')
      ) v(key,side,won) where v.key = any(p_deck_ids) group by s.day,v.key
    ), rolling_totals as (
      select d.day, sum(coalesce(t.total,0)) over (order by d.day rows between 6 preceding and current row) as total
      from days d left join daily_totals t using(day)
    ), rolling_decks as (
      select d.day, a.id,
        sum(coalesce(v.encounters,0)) over w as encounters,
        sum(coalesce(v.registrations,0)) over w as registrations,
        sum(coalesce(v.evaluations,0)) over w as evaluations,
        sum(coalesce(v.wins,0)) over w as wins
      from days d cross join pg_catalog.unnest(p_deck_ids) a(id)
      left join daily_decks v on v.day = d.day and v.key = a.id
      window w as (partition by a.id order by d.day rows between 6 preceding and current row)
    ), series as (
      select r.id, pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date',r.day, 'total',nullif(t.total,0), 'encounters',nullif(r.encounters,0),
        'registrations',nullif(r.registrations,0), 'evaluations',nullif(r.evaluations,0),
        'wins',case when r.evaluations > 0 then r.wins else null end
      ) order by r.day) as points from rolling_decks r join rolling_totals t using(day)
      where r.day >= first_day group by r.id
    )
    select pg_catalog.jsonb_build_object('version',1,'environmentId',p_environment_id,'period',p_period,
      'rankFilters',p_rank_filters,'aggregatedAt',aggregated_at,'dataThrough',data_through,
      'decks',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',a.id,'name',a.name,'className',a.class_name,'points',coalesce(s.points,'[]'::jsonb)
      ) order by a.id) from public.deck_archetypes a left join series s on s.id = a.id
        where a.id = any(p_deck_ids)), '[]'::jsonb))
  );
end;
$function$;

create function public.get_environment_trend_aggregates_v1(p_environment_id uuid,p_period text,p_rank_filters text[],p_deck_ids uuid[])
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.get_environment_trend_aggregates_v1(p_environment_id,p_period,p_rank_filters,p_deck_ids) $function$;
alter function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) owner to postgres;
revoke all on function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;
alter function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) owner to postgres;
revoke all on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;
commit;
