-- V1 history keeps its original projection. Only the metrics displayed to
-- members cross this boundary. The underlying model and sources remain private.
begin;
set local lock_timeout = '3s';

alter function private.review_member_snapshot(jsonb) rename to review_member_snapshot_v1;

create function private.review_member_period(row_data jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select private.review_keys(row_data, array['count','wins','winRate','registrations','encounters','encounterRate','useCount','useWinRate'])
$$;

create function private.review_member_groups(group_data jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, private.review_member_period(value)), '{}'::jsonb)
  from jsonb_each(group_data)
$$;

create function private.review_member_snapshot(doc jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select case when doc->'schemaVersion' is distinct from '2'::jsonb then private.review_member_snapshot_v1(doc)
  else private.review_keys(doc, array['snapshotId','environmentId','environmentName','asOf','periodStart',
    'shortPeriodStart','ranks','matchCount','shortMatchCount','ruleVersion','schemaVersion']) || jsonb_build_object(
    'decks',coalesce((select jsonb_agg(
      private.review_keys(d, array['deckId','name','className','count','winRate','encounterRate','useWinRate','dataTier'])
      || jsonb_build_object('short',private.review_member_period(d->'short'),
        'byRank',private.review_member_groups(d->'byRank'),'byDay',private.review_member_groups(d->'byDay'))
      || case when jsonb_typeof(d->'model') = 'object' then jsonb_build_object('details',
          private.review_keys(d, array['eligibleCount','eligibleWinRate','interval95'])
          || private.review_keys(d->'model',array['measuredConfidence'])) else '{}'::jsonb end order by i)
      from jsonb_array_elements(doc->'decks') with ordinality t(d,i)), '[]'::jsonb),
    'pairs',coalesce((select jsonb_agg(
      private.review_keys(d, array['a','b','count','winRate','dataRating']) ||
      case when jsonb_typeof(d->'model') = 'object' then jsonb_build_object('details',
        private.review_keys(d,array['interval95']) || private.review_keys(d->'model',array['measuredConfidence','assessment']))
      else '{}'::jsonb end order by i)
      from jsonb_array_elements(doc->'pairs') with ordinality t(d,i)), '[]'::jsonb))
  end
$$;
revoke all on function private.review_member_snapshot(jsonb), private.review_member_period(jsonb),
  private.review_member_groups(jsonb) from public, anon, authenticated, service_role;

-- Existing historical rows have no v2 schema. New snapshots and imported
-- documents must agree on the format and prompt even for direct RPC calls.
alter table public.environment_review_runs add constraint environment_review_versions_match
  check (analysis is null or (
    coalesce(snapshot->'schemaVersion','1'::jsonb) = coalesce(analysis->'schemaVersion','1'::jsonb)
    and (snapshot->'schemaVersion' is distinct from '2'::jsonb or
      (snapshot->>'promptVersion' is not null and snapshot->>'promptVersion' is not distinct from analysis->>'promptVersion'))));

-- A closed environment keeps its last cutoff. A new rule edition can use the
-- same cutoff without replacing its historical snapshot or published edition.
alter table public.environment_review_runs drop constraint environment_review_runs_environment_id_as_of_key;
create unique index environment_review_cutoff_version on public.environment_review_runs
  (environment_id, as_of, (coalesce(snapshot->>'schemaVersion','1')));

-- The transition RPC already holds the environment lock. Check both baselines
-- at the write boundary as well, including an initial automatic publication.
create function private.review_large_change(proposed jsonb, baseline jsonb, measured boolean)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(proposed->'decks') n
    join jsonb_array_elements(baseline->'decks') o on o->>'deckId' = n->>'deckId'
    where abs((n->>'tier')::int - (o->>(case when measured then 'dataTier' else 'tier' end))::int) >= 2
  ) or exists (
    select 1 from jsonb_array_elements(proposed->'pairs') n
    join jsonb_array_elements(baseline->'pairs') o on o->>'a' = n->>'a' and o->>'b' = n->>'b'
    where abs((n->>'rating')::int - (o->>(case when measured then 'dataRating' else 'rating' end))::int) >= 2
  )
$$;
create function private.review_auto_publication_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  run public.environment_review_runs%rowtype;
  prior jsonb;
begin
  select * into strict run from public.environment_review_runs where id = new.run_id;
  if run.mode = 'auto' and run.snapshot->'schemaVersion' = '2'::jsonb then
    select payload->'evaluation' into prior from public.environment_review_publications
      where environment_id = new.environment_id;
    if private.review_large_change(new.payload->'evaluation',run.snapshot,true)
       or private.review_large_change(new.payload->'evaluation',prior,false)
       or exists (select 1 from jsonb_array_elements(run.analysis#>'{internal,evidence}') e
                  where e->>'omissionReason' is not null) then
      raise exception 'review_manual_approval_required' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger environment_review_auto_guard before insert or update on public.environment_review_publications
  for each row execute function private.review_auto_publication_guard();
revoke all on function private.review_large_change(jsonb,jsonb,boolean), private.review_auto_publication_guard()
  from public,anon,authenticated,service_role;

-- An edit can replace a public edition while keeping the same run_id.
-- Serialize the edition check with the existing transition's environment lock.
create function public.environment_review_publish_v2(p_id uuid, p_revision integer, p_public jsonb,
  p_reason text, p_expected_publication_id uuid, p_expected_published_at timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  env_id uuid;
  live_at timestamptz;
begin
  select environment_id into strict env_id from public.environment_review_runs where id = p_id;
  perform pg_advisory_xact_lock(hashtextextended('environment_review:' || env_id::text,0));
  select published_at into live_at from public.environment_review_publications where environment_id = env_id;
  if live_at is distinct from p_expected_published_at then
    raise exception 'review_conflict' using errcode = '40001';
  end if;
  return public.environment_review_transition(p_id,p_revision,'publish',null,p_public,p_reason,p_expected_publication_id,null);
end $$;
revoke all on function public.environment_review_publish_v2(uuid,integer,jsonb,text,uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.environment_review_publish_v2(uuid,integer,jsonb,text,uuid,timestamptz)
  to authenticated;

commit;
