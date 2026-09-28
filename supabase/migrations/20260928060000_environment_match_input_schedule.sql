-- Input scheduling only. Existing environments retain their manual behavior.
alter table public.environments
  add column match_input_start_at timestamptz,
  add column match_input_end_at timestamptz,
  add constraint environments_match_input_window_check check (
    match_input_start_at is null or match_input_end_at is null
    or match_input_start_at < match_input_end_at
  );

comment on column public.environments.match_input_start_at is 'Inclusive match input start; NULL means unrestricted.';
comment on column public.environments.match_input_end_at is 'Exclusive match input end; NULL means unrestricted.';

create function public.is_match_input_window_open(
  manual_allowed boolean, starts_at timestamptz, ends_at timestamptz, checked_at timestamptz
)
returns boolean language sql immutable parallel safe
set search_path = ''
as $$
  select manual_allowed is true
    and (starts_at is null or checked_at >= starts_at)
    and (ends_at is null or checked_at < ends_at);
$$;

-- Close the race between Server Action validation and INSERT, including old
-- clients and guest imports. Existing rows and aggregate semantics are untouched.
create function public.check_match_input_window()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  environment public.environments%rowtype;
  checked_at timestamptz;
begin
  select * into environment from public.environments
    where id = new.environment_id;
  checked_at := clock_timestamp();
  if not found or not public.is_match_input_window_open(
    environment.allow_match_input, environment.match_input_start_at, environment.match_input_end_at, checked_at
  ) then
    raise exception 'この環境は現在戦績を入力できません。入力画面を更新してください。'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger matches_check_input_window
before insert on public.matches
for each row execute function public.check_match_input_window();
