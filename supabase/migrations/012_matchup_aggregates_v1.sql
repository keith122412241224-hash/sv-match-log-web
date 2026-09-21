-- Phase 2-A only. Prepared against production 35f6ae2; NOT applied to production.
-- 012 avoids colliding with the separate, unreleased 011 rank migration.
-- Requires existing matches SELECT grants/RLS and public.is_admin().
-- Does not change policies, indexes, tables or match data.
begin;

create or replace function public.get_matchup_aggregates_v1(
  p_environment_id uuid default null,
  p_include_all_users boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
  from grouped;
$$;

revoke all on function public.get_matchup_aggregates_v1(uuid, boolean) from public, anon;
grant execute on function public.get_matchup_aggregates_v1(uuid, boolean) to authenticated;

commit;
