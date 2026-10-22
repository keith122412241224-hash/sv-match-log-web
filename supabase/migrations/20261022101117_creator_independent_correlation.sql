-- Extend existing works without rewriting their documents, IDs or revision history.
begin;
alter table public.creator_correlations alter column tier_work_id drop not null;
-- The existing UNIQUE, RESTRICT FK, no-reparenting validator and image refs remain.
create index creator_correlations_updated_id_idx on public.creator_correlations(updated_at desc,id desc);

create table public.creator_obs_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  tier_work_id uuid references public.creator_tier_works(id) on delete restrict,
  correlation_id uuid references public.creator_correlations(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_obs_sets_has_work check (tier_work_id is not null or correlation_id is not null)
);
create index creator_obs_sets_tier_idx on public.creator_obs_sets(tier_work_id);
create index creator_obs_sets_correlation_idx on public.creator_obs_sets(correlation_id);
create index creator_obs_sets_created_by_idx on public.creator_obs_sets(created_by);
create index creator_obs_sets_updated_id_idx on public.creator_obs_sets(updated_at desc,id desc);
create trigger creator_obs_sets_revision before update on public.creator_obs_sets
  for each row execute function public.creator_touch_revision();
alter table public.creator_obs_sets enable row level security;
revoke all on public.creator_obs_sets from public,anon,authenticated;
grant select,insert,update,delete on public.creator_obs_sets to authenticated;
create policy creator_obs_sets_admin on public.creator_obs_sets for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false');
commit;
