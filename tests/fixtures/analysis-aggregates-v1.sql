-- Local PostgreSQL test fixture for the installed Phase 2-B RPC.
-- Used only by analysis-rpc.integration.cjs; not a deployment migration.
begin;

create or replace function public.get_analysis_aggregates_v1(
  p_environment_id uuid default null,
  p_include_all_users boolean default false,
  p_include_reversed boolean default false,
  p_use_archetype boolean default true,
  p_my_deck_id uuid default null,
  p_opponent_deck_id uuid default null,
  p_result public.match_result default null,
  p_turn_order public.turn_order default null,
  p_played_from timestamptz default null,
  p_played_to timestamptz default null,
  p_recent_deck_ids uuid[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with source_matches as (
    select id, played_at, my_deck_id, opponent_deck_id,
      my_archetype_id, opponent_archetype_id, result, turn_order
    from public.matches m
    where (select auth.uid()) is not null
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
  ) from ordered;
$$;

revoke all on function public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[]) from public, anon;
grant execute on function public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[]) to authenticated, service_role;

commit;
