-- Additive JSON fields only. Existing Phase 1/2 validators, refs and RLS stay intact.
begin;
create function public.creator_validate_correlation_ux() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare e jsonb; field text; inherited_title text;
begin
  if not (new.document ? 'title') then
    if tg_op = 'UPDATE' then inherited_title := old.document->>'title'; end if;
    if inherited_title is null then
      select document->>'title' into inherited_title from public.creator_tier_works where id = new.tier_work_id;
    end if;
    new.document := new.document || jsonb_build_object('title',coalesce(inherited_title,''));
  end if;
  if jsonb_typeof(new.document->'title') is distinct from 'string' or length(new.document->>'title') > 120 then
    raise exception 'Invalid correlation title' using errcode = '23514';
  end if;
  foreach field in array array['showLabels','showStats'] loop
    if new.document ? field and jsonb_typeof(new.document->field) is distinct from 'boolean' then
      raise exception 'Invalid correlation visibility' using errcode = '23514';
    end if;
  end loop;
  if jsonb_typeof(new.document->'edges') = 'array' then
    for e in select value from jsonb_array_elements(new.document->'edges') loop
      if e ? 'type' and (jsonb_typeof(e->'type') is distinct from 'string' or e->>'type' not in ('forward','bidirectional')) then
        raise exception 'Invalid edge type' using errcode = '23514';
      end if;
      foreach field in array array['winRate','matchCount'] loop
        if e ? field and e->field <> 'null'::jsonb then
          if jsonb_typeof(e->field) is distinct from 'number' then
            raise exception 'Invalid edge statistic' using errcode = '23514';
          end if;
          if field = 'winRate' and (e->>field)::numeric not between 0 and 100 then
            raise exception 'Win rate must be 0..100' using errcode = '23514';
          end if;
          if field = 'matchCount' and ((e->>field)::numeric not between 0 and 9007199254740991 or trunc((e->>field)::numeric) <> (e->>field)::numeric) then
            raise exception 'Match count must be a nonnegative safe integer' using errcode = '23514';
          end if;
        end if;
      end loop;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.creator_validate_correlation_ux() from public,anon,authenticated;
create trigger creator_correlation_ux before insert or update on public.creator_correlations
  for each row execute function public.creator_validate_correlation_ux();
-- Copy once, including an intentionally empty title. Revision bumps invalidate stale editors.
update public.creator_correlations c set document = c.document || jsonb_build_object('title',t.document->>'title')
  from public.creator_tier_works t where t.id = c.tier_work_id and not (c.document ? 'title');
commit;
