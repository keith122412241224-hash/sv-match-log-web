create extension if not exists "pgcrypto";

create type deck_type as enum ('my_deck', 'opponent_deck');
create type turn_order as enum ('first', 'second');
create type match_result as enum ('win', 'lose');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date,
  memo text,
  created_at timestamptz not null default now()
);

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  class_name text not null,
  deck_type deck_type not null default 'my_deck',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, deck_type, name)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  environment_id uuid references public.environments(id) on delete set null,
  my_deck_id uuid not null references public.decks(id) on delete restrict,
  opponent_deck_id uuid not null references public.decks(id) on delete restrict,
  turn_order turn_order not null,
  result match_result not null,
  played_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
);

create index environments_user_id_idx on public.environments(user_id);
create index decks_user_id_type_idx on public.decks(user_id, deck_type);
create index matches_user_id_played_at_idx on public.matches(user_id, played_at desc);
create index matches_my_deck_id_idx on public.matches(my_deck_id);
create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);

alter table public.profiles enable row level security;
alter table public.environments enable row level security;
alter table public.admin_users enable row level security;
alter table public.decks enable row level security;
alter table public.matches enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "admin_users_select_admin" on public.admin_users
  for select to authenticated using (public.is_admin());

create policy "environments_select_shared" on public.environments
  for select to authenticated using (true);

create policy "environments_insert_admin" on public.environments
  for insert to authenticated with check (public.is_admin() and auth.uid() = user_id);

create policy "environments_update_admin" on public.environments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "environments_delete_admin" on public.environments
  for delete to authenticated using (public.is_admin());

create policy "decks_select_own" on public.decks
  for select using (auth.uid() = user_id);

create policy "decks_insert_own" on public.decks
  for insert with check (auth.uid() = user_id);

create policy "decks_update_own" on public.decks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "decks_delete_own" on public.decks
  for delete using (auth.uid() = user_id);

create policy "matches_select_own" on public.matches
  for select using (auth.uid() = user_id);

create policy "matches_insert_own" on public.matches
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
    and (
      environment_id is null
      or exists (
        select 1 from public.environments e
        where e.id = environment_id
      )
    )
  );

create policy "matches_update_own" on public.matches
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
    and (
      environment_id is null
      or exists (
        select 1 from public.environments e
        where e.id = environment_id
      )
    )
  );

create policy "matches_delete_own" on public.matches
  for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
