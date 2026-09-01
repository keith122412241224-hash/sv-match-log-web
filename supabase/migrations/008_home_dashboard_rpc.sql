-- Optional performance migration: return home summary stats and recent matches in one DB round trip.

create or replace function public.get_home_dashboard(p_environment_id uuid default null, p_limit integer default 10)
returns jsonb
language sql
stable
set search_path = public
as $$
  with scoped_matches as (
    select *
    from public.matches
    where user_id = auth.uid()
      and (p_environment_id is null or environment_id = p_environment_id)
  ),
  summary as (
    select
      count(*)::integer as total,
      count(*) filter (where result = 'win')::integer as wins,
      count(*) filter (where turn_order = 'first')::integer as first_total,
      count(*) filter (where turn_order = 'first' and result = 'win')::integer as first_wins,
      count(*) filter (where turn_order = 'second')::integer as second_total,
      count(*) filter (where turn_order = 'second' and result = 'win')::integer as second_wins
    from scoped_matches
  ),
  recent as (
    select
      m.id,
      m.played_at,
      m.result,
      m.turn_order,
      jsonb_build_object('name', e.name) as environment,
      jsonb_build_object('name', my_deck.name, 'class_name', my_deck.class_name) as my_deck,
      jsonb_build_object('name', opponent_deck.name, 'class_name', opponent_deck.class_name) as opponent_deck
    from scoped_matches m
    left join public.environments e on e.id = m.environment_id
    left join public.decks my_deck on my_deck.id = m.my_deck_id
    left join public.decks opponent_deck on opponent_deck.id = m.opponent_deck_id
    order by m.played_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'total', summary.total,
      'wins', summary.wins,
      'winRate', case when summary.total = 0 then null else summary.wins::numeric * 100 / summary.total end,
      'firstWinRate', case when summary.first_total = 0 then null else summary.first_wins::numeric * 100 / summary.first_total end,
      'secondWinRate', case when summary.second_total = 0 then null else summary.second_wins::numeric * 100 / summary.second_total end
    ),
    'recent',
    coalesce((select jsonb_agg(to_jsonb(recent)) from recent), '[]'::jsonb)
  )
  from summary;
$$;

grant execute on function public.get_home_dashboard(uuid, integer) to authenticated;
