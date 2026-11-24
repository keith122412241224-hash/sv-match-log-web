begin;

-- One statement snapshot across both elapsed-time windows, every rank and turn.
-- The caller's ordinary admin RLS policies apply to every input relation.
create function public.get_environment_review_source_v1(p_environment_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  env public.environments;
  boundary timestamptz;
  starts timestamptz;
  short_starts timestamptz;
begin
  if auth.uid() is null or (auth.jwt() -> 'is_anonymous') is distinct from 'false'::jsonb
     or public.is_admin() is not true then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into strict env from public.environments where id = p_environment_id;
  boundary := date_bin(interval '30 minutes', statement_timestamp(), timestamptz '1970-01-01 00:00Z');
  if env.dashboard_end_at <= statement_timestamp() then boundary := env.dashboard_end_at; end if;
  starts := coalesce(env.start_date::timestamp at time zone 'Asia/Tokyo', env.created_at);
  if starts > boundary then
    raise exception 'Environment aggregation period has not started' using errcode = '22023';
  end if;
  short_starts := greatest(starts, boundary - interval '72 hours');
  starts := greatest(starts, boundary - interval '168 hours');
  return (
    with catalog as materialized (
      select a.id,a.name,a.class_name,a.is_active,a.is_other from public.deck_archetypes a
      where a.environment_id is null or a.environment_id = p_environment_id
    ), src as materialized (
      select (m.played_at at time zone 'Asia/Tokyo')::date as day, m.played_at >= short_starts as recent,
        a.id as my, b.id as opp, m.user_id, m.result = 'win' as won, m.turn_order as turn,
        case when m.rank_tier is null then 'unranked'
          when m.rank_tier = 'master' then 'master:' || m.master_group
          when m.rank_tier = 'grandmaster' then 'grandmaster:' || m.grandmaster_rating
          else m.rank_tier end as rank
      from public.matches m
      left join catalog a on a.id = m.my_archetype_id
      left join catalog b on b.id = m.opponent_archetype_id
      where m.environment_id = p_environment_id and m.played_at >= starts and m.played_at < boundary
    ), cells as (
      select day, recent, my, opp, rank, turn, count(*) as total, count(*) filter(where won) as wins
      from src group by day,recent,my,opp,rank,turn
    ), by_contributor as (
      -- Registration-side users, never opponent identities. Mirror contributes two evaluations.
      select key, s.user_id, count(*) as evaluations, count(*) filter(where v.win) as wins
      from src s cross join lateral (values (s.my,s.won),(s.opp,not s.won)) as v(key,win)
      where key is not null group by key,s.user_id
    ), by_pair_contributor as (
      select least(my,opp) as a,greatest(my,opp) as b,user_id,count(*) as registrations,
        count(*) filter(where case when my < opp then won else not won end) as wins
      from src where my <> opp group by least(my,opp),greatest(my,opp),user_id
    ), pair_bias as (
      select a,b,count(*) as contributors,100.0 * max(registrations) / sum(registrations) as concentration,
        avg(100.0 * wins / registrations) as equal_rate
      from by_pair_contributor group by a,b
    ), pilots as (
      select my as key, count(distinct user_id) as users from src where my is not null group by my
    ), bias as (
      select key,count(*) as contributors,100.0 * max(evaluations) / sum(evaluations) as concentration,
        avg(100.0 * wins / evaluations) as equal_rate
      from by_contributor group by key
    )
    select jsonb_build_object(
      'environmentId',env.id,'environmentName',env.name,'asOf',boundary,'periodStart',starts,
      'shortPeriodStart',short_starts,'contributors',(select count(distinct user_id) from src),
      'decks',coalesce((select jsonb_agg(jsonb_build_object('deckId',c.id,'name',c.name,'className',c.class_name,
        'isOther',c.is_other,'contributors',coalesce(x.contributors,0),'pilots',coalesce(p.users,0),'topContributorShare',x.concentration,
        'userEqualWinRate',x.equal_rate) order by c.id)
        from catalog c left join bias x on c.id=x.key left join pilots p on c.id=p.key where c.is_active or x.key is not null),'[]'::jsonb),
      'pairBias',coalesce((select jsonb_agg(jsonb_build_object('a',a,'b',b,'contributors',contributors,
        'topContributorShare',concentration,'userEqualWinRate',equal_rate) order by a,b) from pair_bias),'[]'::jsonb),
      'cells',coalesce((select jsonb_agg(to_jsonb(g) order by day,recent,my,opp,rank,turn) from cells g),'[]'::jsonb))
  );
end;
$$;
revoke all on function public.get_environment_review_source_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_environment_review_source_v1(uuid) to authenticated;
commit;
