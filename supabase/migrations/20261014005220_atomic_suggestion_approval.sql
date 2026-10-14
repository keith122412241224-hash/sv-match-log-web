-- Apply only after the paused compatibility deployment is active and old
-- approval requests/deployments are drained or inaccessible. See runbook.
-- The migration runner must use one transaction (including history insertion).
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create schema if not exists suggestion_private;
revoke all on schema suggestion_private from public, anon, authenticated;

create table if not exists suggestion_private.approvals (
  suggestion_id uuid primary key,
  archetype_id uuid unique references public.deck_archetypes(id) on delete restrict,
  class_name text,
  approved_name text,
  legacy boolean not null default false,
  recorded_at timestamptz not null default now(),
  constraint approval_receipt_shape check (
    (legacy and archetype_id is null and class_name is null and approved_name is null)
    or (not legacy and archetype_id is not null and class_name is not null and approved_name is not null)
  )
);
alter table suggestion_private.approvals enable row level security;
revoke all on suggestion_private.approvals from public, anon, authenticated, service_role;
-- Deliberately no candidate FK: retain the receipt across user deletion so a
-- reused candidate UUID cannot create a second archetype. Never infer a link.
insert into suggestion_private.approvals(suggestion_id, legacy)
select id, true from public.deck_suggestions where status = 'approved'
on conflict (suggestion_id) do nothing;

create or replace function suggestion_private.guard_suggestion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or exists (select 1 from suggestion_private.approvals where suggestion_id = new.id) then
      raise exception 'suggestion_initial_state' using errcode = '23514';
    end if;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or (old.status <> 'pending' and (new.status is distinct from old.status
        or new.class_name is distinct from old.class_name or new.suggested_name is distinct from old.suggested_name)) then
      raise exception 'suggestion_terminal_state' using errcode = '23514';
    end if;
    if old.status <> 'approved' and new.status = 'approved' and not exists (
      select 1 from suggestion_private.approvals a where a.suggestion_id = new.id
        and not a.legacy and a.class_name = new.class_name
    ) then
      raise exception 'approval_rpc_required' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
alter function suggestion_private.guard_suggestion() owner to postgres;
revoke all on function suggestion_private.guard_suggestion() from public, anon, authenticated, service_role;
drop trigger if exists suggestion_approval_guard on public.deck_suggestions;
create trigger suggestion_approval_guard before insert or update on public.deck_suggestions
for each row execute function suggestion_private.guard_suggestion();

create or replace function suggestion_private.apply_decision(p_id uuid, p_operation text, p_class text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  candidate public.deck_suggestions%rowtype;
  receipt suggestion_private.approvals%rowtype;
  created_id uuid;
  normalized_name text := btrim(p_name);
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) or not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_id is null or p_operation is null or p_operation not in ('approve','reject') then
    return jsonb_build_object('status','invalid');
  end if;
  if p_operation = 'approve' and (p_class is null or p_class not in ('エルフ','ロイヤル','ウィッチ','ドラゴン','ナイトメア','ビショップ','ネメシス')
      or normalized_name is null or normalized_name = '') then
    return jsonb_build_object('status','invalid');
  end if;
  select * into candidate from public.deck_suggestions where id = p_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  select * into receipt from suggestion_private.approvals where suggestion_id = p_id;
  if found then
    if receipt.legacy then return jsonb_build_object('status','legacy'); end if;
    if candidate.status <> 'approved' or not exists (select 1 from public.deck_archetypes where id = receipt.archetype_id) then
      return jsonb_build_object('status','inconsistent');
    end if;
    if p_operation <> 'approve' or receipt.class_name is distinct from p_class or receipt.approved_name is distinct from normalized_name then
      return jsonb_build_object('status','conflict');
    end if;
    return jsonb_build_object('status','already_approved','archetype_id',receipt.archetype_id);
  end if;
  if candidate.status = 'approved' then return jsonb_build_object('status','inconsistent'); end if;
  if candidate.status = 'rejected' then
    return jsonb_build_object('status',case when p_operation = 'reject' then 'already_rejected' else 'conflict' end);
  end if;
  if p_operation = 'reject' then
    update public.deck_suggestions set status = 'rejected' where id = p_id;
    if not found then raise exception 'suggestion_update_missing' using errcode = '23514'; end if;
    return jsonb_build_object('status','rejected');
  end if;
  if candidate.class_name is distinct from p_class then return jsonb_build_object('status','conflict'); end if;
  insert into public.deck_archetypes(class_name,name,is_active,sort_order)
    values(p_class,normalized_name,true,0) returning id into created_id;
  insert into suggestion_private.approvals(suggestion_id,archetype_id,class_name,approved_name)
    values(p_id,created_id,p_class,normalized_name);
  update public.deck_suggestions set status = 'approved' where id = p_id;
  if not found then raise exception 'suggestion_update_missing' using errcode = '23514'; end if;
  return jsonb_build_object('status','approved','archetype_id',created_id);
  -- Do not swallow SQL errors: every statement must roll back together.
end $$;
alter function suggestion_private.apply_decision(uuid,text,text,text) owner to postgres;
revoke all on function suggestion_private.apply_decision(uuid,text,text,text) from public, anon, authenticated, service_role;
grant usage on schema suggestion_private to authenticated;
grant execute on function suggestion_private.apply_decision(uuid,text,text,text) to authenticated;

create or replace function public.decide_deck_suggestion(p_id uuid, p_operation text, p_class text default null, p_name text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select suggestion_private.apply_decision(p_id,p_operation,p_class,p_name);
$$;
revoke all on function public.decide_deck_suggestion(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.decide_deck_suggestion(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
