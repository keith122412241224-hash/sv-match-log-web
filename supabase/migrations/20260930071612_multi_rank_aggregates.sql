-- E1.2: union disjoint rank buckets BEFORE perspectives and privacy aggregation.
-- Existing RPCs, matches schema/RLS, indexes and thresholds remain untouched.
begin;

CREATE FUNCTION private.get_environment_dashboard_aggregates_v2(p_environment_id uuid, p_period text, p_rank_filters text[] DEFAULT array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  aggregated_at timestamptz := pg_catalog.statement_timestamp();
  data_through timestamptz;
  duration interval;
begin
  -- A boolean JSON claim is required: missing, null, string and anonymous claims fail closed.
  -- No reliance on current_user (the definer owner) or editable user_metadata.
  if auth.uid() is null
    or (auth.jwt() -> 'is_anonymous') is distinct from 'false'::jsonb then
    raise exception 'Member authentication required' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('24h', '3d', '7d', '30d') then
    raise exception 'Invalid environment dashboard period' using errcode = '22023';
  end if;
  -- Validate before filtering. Empty, null, non-atomic and oversized inputs fail closed.
  if p_rank_filters is null or pg_catalog.array_ndims(p_rank_filters) is distinct from 1
    or pg_catalog.cardinality(p_rank_filters) not between 1 and 17
    or exists (select 1 from pg_catalog.unnest(p_rank_filters) v where v is null or not (v = any(array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[]))) then
    raise exception 'Invalid atomic rank selection' using errcode = '22023';
  end if;
  -- Canonical order and deduplication do not multiply source matches.
  select pg_catalog.array_agg(v order by ord) into p_rank_filters
  from pg_catalog.unnest(array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[]) with ordinality as allowed(v, ord)
  where v = any(p_rank_filters);
  if p_environment_id is null or not exists (
    select 1 from public.environments e where e.id = p_environment_id
  ) then
    raise exception 'Invalid environment dashboard environment' using errcode = '22023';
  end if;

  data_through := pg_catalog.date_bin(interval '30 minutes', aggregated_at, timestamptz '1970-01-01 00:00:00+00');
  -- Hours, not calendar days: elapsed windows remain identical across session time zones/DST.
  duration := case p_period when '24h' then interval '24 hours'
    when '3d' then interval '72 hours' when '7d' then interval '168 hours'
    when '30d' then interval '720 hours' end;

  return (
    with periods(label, starts, ends) as (
      values ('current'::text, data_through - duration, data_through),
        ('previous'::text, data_through - duration * 2, data_through - duration)
    ), catalog as materialized (
      -- All common classifications, including inactive ones, independent of observed matches.
      select a.id::text as key, a.name, a.class_name from public.deck_archetypes a
      union all select 'unclassified', '未分類', null::text
    ), source as materialized (
      select p.label, m.user_id,
        coalesce(m.my_archetype_id::text, 'unclassified') as my_key,
        coalesce(m.opponent_archetype_id::text, 'unclassified') as opponent_key, m.result
      from periods p join public.matches m
        on m.played_at >= p.starts and m.played_at < p.ends
      where m.environment_id = p_environment_id
        and (case when m.rank_tier is null then 'unranked'
          when m.rank_tier = 'master' then 'master:' || m.master_group
          when m.rank_tier = 'grandmaster' then 'grandmaster:' || m.grandmaster_rating
          else m.rank_tier end) = any(p_rank_filters)
    ), totals as (
      select p.label, p.starts, p.ends, pg_catalog.count(s.user_id) as total,
        case when pg_catalog.count(s.user_id) = 0 then 'no_data'
          when pg_catalog.count(distinct s.user_id) < 3 then 'privacy_suppressed'
          else 'available' end as status
      from periods p left join source s on s.label = p.label
      group by p.label, p.starts, p.ends
    ), encounters as (
      select label, opponent_key as key, pg_catalog.count(*) as total,
        pg_catalog.count(distinct user_id) as contributors
      from source group by label, opponent_key
    ), evaluations as (
      select s.label, v.key,
        pg_catalog.count(*) filter (where v.side = 0 or s.my_key <> s.opponent_key) as registrations,
        pg_catalog.count(*) as total,
        pg_catalog.count(*) filter (where v.won) as wins,
        pg_catalog.count(distinct s.user_id) as contributors
      from source s cross join lateral (
        values (s.my_key, 0, s.result = 'win'), (s.opponent_key, 1, s.result = 'lose')
      ) v(key, side, won)
      group by s.label, v.key
    ), states as (
      select c.key, t.label, e.total as encounter_count, w.registrations, w.total as evaluations, w.wins,
        case when t.status <> 'available' then t.status
          when e.total is null then 'no_data'
          when e.contributors < 3 then 'privacy_suppressed' else 'available' end as encounter_status,
        case when t.status <> 'available' then t.status
          when w.total is null then 'no_data'
          when w.contributors < 3 then 'privacy_suppressed' else 'available' end as winrate_status
      from catalog c cross join totals t
      left join encounters e on e.label = t.label and e.key = c.key
      left join evaluations w on w.label = t.label and w.key = c.key
    ), safe_deck_periods as (
      select key, label, pg_catalog.jsonb_build_object(
        'encounter', pg_catalog.jsonb_build_object('status', encounter_status,
          'count', case when encounter_status = 'available' then encounter_count else null end),
        'winrate', pg_catalog.jsonb_build_object('status', winrate_status,
          'targetRegistrations', case when winrate_status = 'available' then registrations else null end,
          'evaluationCount', case when winrate_status = 'available' then evaluations else null end,
          'wins', case when winrate_status = 'available' then wins else null end)
      ) as payload from states
    ), safe_totals as (
      select label, pg_catalog.jsonb_build_object('start', starts, 'end', ends,
        'total', pg_catalog.jsonb_build_object('status', status,
          'totalMatches', case when status = 'available' then total else null end)) as payload
      from totals
    )
    select pg_catalog.jsonb_build_object(
      'version', 2, 'period', p_period, 'rankFilters', p_rank_filters, 'environmentId', p_environment_id,
      'aggregatedAt', aggregated_at, 'dataThrough', data_through,
      'current', (select payload from safe_totals where label = 'current'),
      'previous', (select payload from safe_totals where label = 'previous'),
      'decks', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', c.key, 'name', c.name, 'className', c.class_name,
        'current', cur.payload, 'previous', prev.payload
      ) order by c.key) from catalog c
        join safe_deck_periods cur on cur.key = c.key and cur.label = 'current'
        join safe_deck_periods prev on prev.key = c.key and prev.label = 'previous')
    )
  );
end;
$function$;

create function public.get_environment_dashboard_aggregates_v2(p_environment_id uuid, p_period text, p_rank_filters text[] default array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[])
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.get_environment_dashboard_aggregates_v2(p_environment_id, p_period, p_rank_filters) $function$;

CREATE FUNCTION public.get_analysis_aggregates_v3(p_environment_id uuid DEFAULT NULL::uuid, p_include_all_users boolean DEFAULT false, p_include_reversed boolean DEFAULT false, p_use_archetype boolean DEFAULT true, p_my_deck_id uuid DEFAULT NULL::uuid, p_opponent_deck_id uuid DEFAULT NULL::uuid, p_result match_result DEFAULT NULL::match_result, p_turn_order turn_order DEFAULT NULL::turn_order, p_played_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_played_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_recent_deck_ids uuid[] DEFAULT NULL::uuid[], p_rank_filters text[] DEFAULT array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  -- Validate before filtering. Empty, null, non-atomic and oversized inputs fail closed.
  if p_rank_filters is null or pg_catalog.array_ndims(p_rank_filters) is distinct from 1
    or pg_catalog.cardinality(p_rank_filters) not between 1 and 17
    or exists (select 1 from pg_catalog.unnest(p_rank_filters) v where v is null or not (v = any(array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[]))) then
    raise exception 'Invalid atomic rank selection' using errcode = '22023';
  end if;
  -- Canonical order and deduplication do not multiply source matches.
  select pg_catalog.array_agg(v order by ord) into p_rank_filters
  from pg_catalog.unnest(array['unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond']::text[]) with ordinality as allowed(v, ord)
  where v = any(p_rank_filters);
  return (
  with source_matches as (
    select id, played_at, my_deck_id, opponent_deck_id,
      my_archetype_id, opponent_archetype_id, result, turn_order
    from public.matches m
    where (select auth.uid()) is not null
    -- Rank belongs to the source match owner, before perspective expansion.
    and (case when m.rank_tier is null then 'unranked'
          when m.rank_tier = 'master' then 'master:' || m.master_group
          when m.rank_tier = 'grandmaster' then 'grandmaster:' || m.grandmaster_rating
          else m.rank_tier end) = any(p_rank_filters)
      and (m.user_id = (select auth.uid())
        or (coalesce(p_include_all_users, false) and (select public.is_admin())))
      and (p_environment_id is null or m.environment_id = p_environment_id)
      and (p_played_from is null or m.played_at >= p_played_from)
      and (p_played_to is null or m.played_at <= p_played_to)
  ), perspectives as (
    select s.*, 0 as side from source_matches s
    union all
    select id, played_at, opponent_deck_id, my_deck_id,
      opponent_archetype_id, my_archetype_id,
      case when result = 'win' then 'lose' else 'win' end::public.match_result,
      case when turn_order = 'first' then 'second' else 'first' end::public.turn_order,
      1 as side
    from source_matches where coalesce(p_include_reversed, false)
  ), filtered as (
    select id, played_at, side, result, turn_order,
      coalesce(my_archetype_id, my_deck_id) as my_id,
      coalesce(opponent_archetype_id, opponent_deck_id) as opponent_id,
      case when p_use_archetype then coalesce(my_archetype_id, my_deck_id) else my_deck_id end as card_my_id,
      case when p_use_archetype then coalesce(opponent_archetype_id, opponent_deck_id) else opponent_deck_id end as card_opponent_id
    from perspectives
    where (p_my_deck_id is null or
        (case when p_use_archetype then my_archetype_id else my_deck_id end) = p_my_deck_id)
      and (p_opponent_deck_id is null or
        (case when p_use_archetype then opponent_archetype_id else opponent_deck_id end) = p_opponent_deck_id)
      and (p_result is null or result = p_result)
      and (p_turn_order is null or turn_order = p_turn_order)
  ), ordered as (
    select *, row_number() over (order by played_at desc, id desc, side asc) as position
    from filtered
  ), grouped as (
    select my_id, opponent_id, card_my_id, card_opponent_id, turn_order,
      count(*) as total, count(*) filter (where result = 'win') as wins,
      min(position) as first_position
    from ordered
    group by my_id, opponent_id, card_my_id, card_opponent_id, turn_order
  ), ranked_recent as (
    select *, row_number() over (partition by card_my_id order by position) as deck_position
    from ordered
    where p_recent_deck_ids is null or card_my_id = any(p_recent_deck_ids)
  ), recent as (
    select card_my_id, jsonb_agg(jsonb_build_object(
      'id', id, 'playedAt', played_at, 'source', case when side = 0 then 'direct' else 'reversed' end,
      'result', result, 'turnOrder', turn_order, 'order', position
    ) order by position) as views
    from ranked_recent where deck_position <= 10
    group by card_my_id
  )
  select jsonb_build_object(
    'version', 1,
    'registeredMatches', count(distinct id),
    'perspectives', count(*),
    'totalWins', count(*) filter (where result = 'win'),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
      'myDeckId', my_id, 'opponentDeckId', opponent_id,
      'cardMyDeckId', card_my_id, 'cardOpponentDeckId', card_opponent_id,
      'turnOrder', turn_order, 'total', total, 'wins', wins, 'firstOrder', first_position
    ) order by first_position), '[]'::jsonb) from grouped),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
      'deckId', card_my_id, 'views', views
    )), '[]'::jsonb) from recent)
  ) from ordered
  );
end;
$function$;

alter function private.get_environment_dashboard_aggregates_v2(uuid,text,text[]) owner to postgres;
revoke all on function private.get_environment_dashboard_aggregates_v2(uuid,text,text[]) from public, anon, authenticated, service_role;
grant execute on function private.get_environment_dashboard_aggregates_v2(uuid,text,text[]) to authenticated;
alter function public.get_environment_dashboard_aggregates_v2(uuid,text,text[]) owner to postgres;
revoke all on function public.get_environment_dashboard_aggregates_v2(uuid,text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.get_environment_dashboard_aggregates_v2(uuid,text,text[]) to authenticated;
alter function public.get_analysis_aggregates_v3(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[],text[]) owner to postgres;
revoke all on function public.get_analysis_aggregates_v3(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[],text[]) from public, anon, authenticated, service_role;
grant execute on function public.get_analysis_aggregates_v3(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[],text[]) to authenticated, service_role;

commit;
