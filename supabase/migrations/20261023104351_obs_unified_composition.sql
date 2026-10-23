-- Additive migration: no row rewrite, revision trigger, policy or grant changes.
begin;
alter table public.creator_obs_sets
  add column environment_id uuid references public.environments(id) on delete restrict,
  add column environment_period text not null default '7d',
  add column environment_ranks text[] not null default array['unranked','beginner','d','c','b','a','aa','master:emerald','master:topaz','master:ruby','master:sapphire','master:diamond','grandmaster:none','grandmaster:epic','grandmaster:ultimate','grandmaster:legend','grandmaster:beyond'],
  add column content_order text[] not null default array['environment','tier','correlation'],
  add column display_mode text not null default 'continuous',
  drop constraint creator_obs_sets_has_work,
  add constraint creator_obs_sets_has_content check (environment_id is not null or tier_work_id is not null or correlation_id is not null),
  add constraint creator_obs_sets_period check (environment_period in ('24h','3d','7d','30d','all')),
  add constraint creator_obs_sets_ranks check (
    array_ndims(environment_ranks) = 1 and cardinality(environment_ranks) between 1 and 17
    and array_position(environment_ranks, null) is null
    and environment_ranks <@ array['unranked','beginner','d','c','b','a','aa','master:emerald','master:topaz','master:ruby','master:sapphire','master:diamond','grandmaster:none','grandmaster:epic','grandmaster:ultimate','grandmaster:legend','grandmaster:beyond']),
  -- Keep inactive slots so old clients can still change the two work references.
  -- Cardinality + both containments guarantee a full permutation without duplicates.
  add constraint creator_obs_sets_order check (
    array_ndims(content_order) = 1 and cardinality(content_order) = 3
    and array_position(content_order, null) is null
    and content_order @> array['environment','tier','correlation']
    and content_order <@ array['environment','tier','correlation']),
  add constraint creator_obs_sets_display check (display_mode in ('continuous','individual'));
create index creator_obs_sets_environment_idx on public.creator_obs_sets(environment_id);
commit;
