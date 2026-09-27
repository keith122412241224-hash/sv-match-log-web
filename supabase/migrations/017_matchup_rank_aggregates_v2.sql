-- R3-B: additive matchup rank filter. Requires R1 and existing v1 privileges.
-- No tables, policies, indexes or existing functions are changed.
begin;
create or replace function public.get_matchup_aggregates_v2(
  p_environment_id uuid default null,
  p_include_all_users boolean default false,
  p_rank_filter text default 'all'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_rank_filter is not null and p_rank_filter not in ('all', 'master-plus', 'master', 'grandmaster', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond') then
    raise exception 'Invalid matchup rank filter' using errcode = '22023';
  end if;
  -- v1 group array order is unspecified. Delegate all to preserve exact JSON.
  if p_rank_filter is null or p_rank_filter = 'all' then
    return public.get_matchup_aggregates_v1(p_environment_id, p_include_all_users);
  end if;
  -- Rank filters the original registration before grouping; totals and cells
  -- are derived from this same grouped population, including hidden IDs.
  return (
with grouped as (
    select
      coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
      coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
      count(*) as total,
      count(*) filter (where m.result = 'win') as wins
    from public.matches m
    where (select auth.uid()) is not null
      and (
        m.user_id = (select auth.uid())
        or (coalesce(p_include_all_users, false) and (select public.is_admin()))
      )
      and (p_environment_id is null or m.environment_id = p_environment_id)
    and (p_rank_filter is null or p_rank_filter = 'all'
      or (p_rank_filter = 'master-plus' and m.rank_tier in ('master', 'grandmaster'))
      or (p_rank_filter = 'master' and m.rank_tier = 'master')
      or (p_rank_filter = 'grandmaster' and m.rank_tier = 'grandmaster')
      or (m.rank_tier = 'master' and p_rank_filter = 'master:' || m.master_group)
      or (m.rank_tier = 'grandmaster' and p_rank_filter = 'grandmaster:' || m.grandmaster_rating))
    group by coalesce(m.my_archetype_id, m.my_deck_id),
             coalesce(m.opponent_archetype_id, m.opponent_deck_id)
  )
  select jsonb_build_object(
    'version', 1,
    'totalMatches', coalesce(sum(total), 0),
    'groups', coalesce(jsonb_agg(jsonb_build_object(
      'myDeckId', my_id,
      'opponentDeckId', opponent_id,
      'total', total,
      'wins', wins
    )), '[]'::jsonb)
  )
  from grouped
  );
end;
$$;
revoke all on function public.get_matchup_aggregates_v2(uuid, boolean, text) from public, anon;
grant execute on function public.get_matchup_aggregates_v2(uuid, boolean, text) to authenticated, service_role;
commit;
