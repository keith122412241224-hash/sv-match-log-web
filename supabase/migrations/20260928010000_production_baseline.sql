-- CANDIDATE ONLY. Never execute against existing Production.
-- Source: Production catalog 2026-09-28, app 2158fa50b1d83dde2dd22ecd527c0f604b719538.
-- Empty application schema on a provisioned Supabase platform required.
-- Platform: auth.users, auth.uid(), postgres/anon/authenticated/service_role/supabase_admin.
-- Extensions inventory is in platform-prerequisites.json; no public extension objects.
-- gen_random_uuid() is a PostgreSQL core function (no pgcrypto dependency).
-- Managed auth/storage/vault schemas and platform role settings are NOT recreated here.
-- supabase_admin default privileges are platform prerequisites, never altered by this file.
-- No seeds, backfills, historical deletes, or migration history operations.
begin;
set local search_path = public, pg_catalog;
do $guard$ begin
 if current_user <> 'postgres' then raise exception 'Run candidate as postgres on an EMPTY app database'; end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then raise exception 'Supabase platform prerequisites missing'; end if;
 if not exists(select 1 from pg_extension where extname='plpgsql') or to_regprocedure('pg_catalog.gen_random_uuid()') is null then raise exception 'PostgreSQL core/plpgsql prerequisites missing'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')) then raise exception 'Refusing nonempty public schema'; end if;
end $guard$;
alter schema public owner to pg_database_owner;
revoke all on schema public from public;
grant usage on schema public to public, postgres, anon, authenticated, service_role;


create type public."deck_type" as enum ('my_deck', 'opponent_deck');

create type public."match_result" as enum ('win', 'lose');

create type public."suggestion_status" as enum ('pending', 'approved', 'rejected');

create type public."turn_order" as enum ('first', 'second');

create table public."admin_users" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."deck_aliases" (
  "id" uuid default gen_random_uuid() not null,
  "archetype_id" uuid not null,
  "alias_name" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."deck_archetypes" (
  "id" uuid default gen_random_uuid() not null,
  "class_name" text not null,
  "name" text not null,
  "environment_id" uuid,
  "environment_name" text,
  "is_active" boolean default true not null,
  "is_other" boolean default false not null,
  "sort_order" integer default 0 not null,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."deck_suggestions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "class_name" text not null,
  "suggested_name" text not null,
  "memo" text,
  "status" suggestion_status default 'pending'::suggestion_status not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."decks" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "class_name" text not null,
  "deck_type" deck_type default 'my_deck'::deck_type not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."environments" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "start_date" date,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "allow_match_input" boolean default true not null
);

create table public."matches" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "environment_id" uuid,
  "my_deck_id" uuid not null,
  "opponent_deck_id" uuid not null,
  "turn_order" turn_order not null,
  "result" match_result not null,
  "played_at" timestamp with time zone default now() not null,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "my_user_deck_id" uuid,
  "my_archetype_id" uuid,
  "opponent_archetype_id" uuid,
  "rank_tier" text,
  "master_group" text,
  "grandmaster_rating" text
);

create table public."profiles" (
  "id" uuid not null,
  "email" text not null,
  "display_name" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."user_decks" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "archetype_id" uuid not null,
  "custom_name" text,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."admin_users" add constraint "admin_users_pkey" PRIMARY KEY (id);

alter table public."admin_users" add constraint "admin_users_user_id_key" UNIQUE (user_id);

alter table public."deck_aliases" add constraint "deck_aliases_archetype_id_alias_name_key" UNIQUE (archetype_id, alias_name);

alter table public."deck_aliases" add constraint "deck_aliases_pkey" PRIMARY KEY (id);

alter table public."deck_archetypes" add constraint "deck_archetypes_pkey" PRIMARY KEY (id);

alter table public."deck_suggestions" add constraint "deck_suggestions_pkey" PRIMARY KEY (id);

alter table public."decks" add constraint "decks_pkey" PRIMARY KEY (id);

alter table public."decks" add constraint "decks_user_id_deck_type_name_key" UNIQUE (user_id, deck_type, name);

alter table public."environments" add constraint "environments_pkey" PRIMARY KEY (id);

alter table public."matches" add constraint "matches_pkey" PRIMARY KEY (id);

alter table public."matches" add constraint "matches_rank_metadata_check" CHECK (((((rank_tier IS NULL) AND (master_group IS NULL) AND (grandmaster_rating IS NULL)) OR ((rank_tier = ANY (ARRAY['beginner'::text, 'd'::text, 'c'::text, 'b'::text, 'a'::text, 'aa'::text])) AND (master_group IS NULL) AND (grandmaster_rating IS NULL)) OR ((rank_tier = 'master'::text) AND (master_group = ANY (ARRAY['emerald'::text, 'topaz'::text, 'ruby'::text, 'sapphire'::text, 'diamond'::text])) AND (grandmaster_rating IS NULL)) OR ((rank_tier = 'grandmaster'::text) AND (master_group IS NULL) AND (grandmaster_rating = ANY (ARRAY['none'::text, 'epic'::text, 'ultimate'::text, 'legend'::text, 'beyond'::text])))) IS TRUE));

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."user_decks" add constraint "user_decks_pkey" PRIMARY KEY (id);

alter table public."admin_users" add constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."deck_aliases" add constraint "deck_aliases_archetype_id_fkey" FOREIGN KEY (archetype_id) REFERENCES deck_archetypes(id) ON DELETE CASCADE;

alter table public."deck_archetypes" add constraint "deck_archetypes_environment_id_fkey" FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL;

alter table public."deck_suggestions" add constraint "deck_suggestions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."decks" add constraint "decks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."environments" add constraint "environments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."matches" add constraint "matches_environment_id_fkey" FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL;

alter table public."matches" add constraint "matches_my_archetype_id_fkey" FOREIGN KEY (my_archetype_id) REFERENCES deck_archetypes(id) ON DELETE SET NULL;

alter table public."matches" add constraint "matches_my_deck_id_fkey" FOREIGN KEY (my_deck_id) REFERENCES decks(id) ON DELETE RESTRICT;

alter table public."matches" add constraint "matches_my_user_deck_id_fkey" FOREIGN KEY (my_user_deck_id) REFERENCES user_decks(id) ON DELETE SET NULL;

alter table public."matches" add constraint "matches_opponent_archetype_id_fkey" FOREIGN KEY (opponent_archetype_id) REFERENCES deck_archetypes(id) ON DELETE SET NULL;

alter table public."matches" add constraint "matches_opponent_deck_id_fkey" FOREIGN KEY (opponent_deck_id) REFERENCES decks(id) ON DELETE RESTRICT;

alter table public."matches" add constraint "matches_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."user_decks" add constraint "user_decks_archetype_id_fkey" FOREIGN KEY (archetype_id) REFERENCES deck_archetypes(id) ON DELETE RESTRICT;

alter table public."user_decks" add constraint "user_decks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX deck_aliases_alias_name_idx ON public.deck_aliases USING btree (alias_name);

CREATE INDEX deck_archetypes_class_active_idx ON public.deck_archetypes USING btree (class_name, is_active, sort_order);

CREATE UNIQUE INDEX deck_archetypes_unique_name_environment_idx ON public.deck_archetypes USING btree (class_name, name, COALESCE(environment_name, ''::text));

CREATE INDEX deck_suggestions_status_idx ON public.deck_suggestions USING btree (status, created_at DESC);

CREATE INDEX decks_user_id_type_idx ON public.decks USING btree (user_id, deck_type);

CREATE INDEX environments_user_id_idx ON public.environments USING btree (user_id);

CREATE INDEX matches_archetype_idx ON public.matches USING btree (user_id, my_archetype_id, opponent_archetype_id);

CREATE INDEX matches_my_deck_id_idx ON public.matches USING btree (my_deck_id);

CREATE INDEX matches_opponent_deck_id_idx ON public.matches USING btree (opponent_deck_id);

CREATE INDEX matches_user_id_played_at_idx ON public.matches USING btree (user_id, played_at DESC);

CREATE INDEX user_decks_user_id_idx ON public.user_decks USING btree (user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$function$;

alter function public.is_admin() owner to postgres;

revoke all on function public.is_admin() from public, anon, authenticated, service_role;

grant execute on function public.is_admin() to postgres, public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

alter function public.set_updated_at() owner to postgres;

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

grant execute on function public.set_updated_at() to postgres, public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

grant execute on function public.handle_new_user() to postgres, public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_home_dashboard(p_environment_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

alter function public.get_home_dashboard(uuid,integer) owner to postgres;

revoke all on function public.get_home_dashboard(uuid,integer) from public, anon, authenticated, service_role;

grant execute on function public.get_home_dashboard(uuid,integer) to postgres, public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_matchup_aggregates_v1(p_environment_id uuid DEFAULT NULL::uuid, p_include_all_users boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

alter function public.get_matchup_aggregates_v1(uuid,boolean) owner to postgres;

revoke all on function public.get_matchup_aggregates_v1(uuid,boolean) from public, anon, authenticated, service_role;

grant execute on function public.get_matchup_aggregates_v1(uuid,boolean) to postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_analysis_aggregates_v1(p_environment_id uuid DEFAULT NULL::uuid, p_include_all_users boolean DEFAULT false, p_include_reversed boolean DEFAULT false, p_use_archetype boolean DEFAULT true, p_my_deck_id uuid DEFAULT NULL::uuid, p_opponent_deck_id uuid DEFAULT NULL::uuid, p_result match_result DEFAULT NULL::match_result, p_turn_order turn_order DEFAULT NULL::turn_order, p_played_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_played_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_recent_deck_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with source_matches as (
    select id, played_at, my_deck_id, opponent_deck_id,
      my_archetype_id, opponent_archetype_id, result, turn_order
    from public.matches m
    where (select auth.uid()) is not null
      and (m.user_id = (select auth.uid())
        or (coalesce(p_include_all_users, false) and (select public.is_admin())))
      and (p_environment_id is null or m.environment_id = p_environment_id)
      and (p_played_from is null or m.played_at >= p_played_from)
      and (p_played_to is null or m.played_at <= p_played_to)
  ), perspectives as (
    select s.*, 0 as side from source_matches s
    union all
    select id, played_at, opponent_deck_id, my_deck_id,
      opponent_archetype_id, my_archetype_id,
      case when result = 'win' then 'lose' else 'win' end::public.match_result,
      case when turn_order = 'first' then 'second' else 'first' end::public.turn_order,
      1 as side
    from source_matches where coalesce(p_include_reversed, false)
  ), filtered as (
    select id, played_at, side, result, turn_order,
      coalesce(my_archetype_id, my_deck_id) as my_id,
      coalesce(opponent_archetype_id, opponent_deck_id) as opponent_id,
      case when p_use_archetype then coalesce(my_archetype_id, my_deck_id) else my_deck_id end as card_my_id,
      case when p_use_archetype then coalesce(opponent_archetype_id, opponent_deck_id) else opponent_deck_id end as card_opponent_id
    from perspectives
    where (p_my_deck_id is null or
        (case when p_use_archetype then my_archetype_id else my_deck_id end) = p_my_deck_id)
      and (p_opponent_deck_id is null or
        (case when p_use_archetype then opponent_archetype_id else opponent_deck_id end) = p_opponent_deck_id)
      and (p_result is null or result = p_result)
      and (p_turn_order is null or turn_order = p_turn_order)
  ), ordered as (
    select *, row_number() over (order by played_at desc, id desc, side asc) as position
    from filtered
  ), grouped as (
    select my_id, opponent_id, card_my_id, card_opponent_id, turn_order,
      count(*) as total, count(*) filter (where result = 'win') as wins,
      min(position) as first_position
    from ordered
    group by my_id, opponent_id, card_my_id, card_opponent_id, turn_order
  ), ranked_recent as (
    select *, row_number() over (partition by card_my_id order by position) as deck_position
    from ordered
    where p_recent_deck_ids is null or card_my_id = any(p_recent_deck_ids)
  ), recent as (
    select card_my_id, jsonb_agg(jsonb_build_object(
      'id', id, 'playedAt', played_at, 'source', case when side = 0 then 'direct' else 'reversed' end,
      'result', result, 'turnOrder', turn_order, 'order', position
    ) order by position) as views
    from ranked_recent where deck_position <= 10
    group by card_my_id
  )
  select jsonb_build_object(
    'version', 1,
    'registeredMatches', count(distinct id),
    'perspectives', count(*),
    'totalWins', count(*) filter (where result = 'win'),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
      'myDeckId', my_id, 'opponentDeckId', opponent_id,
      'cardMyDeckId', card_my_id, 'cardOpponentDeckId', card_opponent_id,
      'turnOrder', turn_order, 'total', total, 'wins', wins, 'firstOrder', first_position
    ) order by first_position), '[]'::jsonb) from grouped),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
      'deckId', card_my_id, 'views', views
    )), '[]'::jsonb) from recent)
  ) from ordered;
$function$;

alter function public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[]) owner to postgres;

revoke all on function public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[]) from public, anon, authenticated, service_role;

grant execute on function public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[]) to postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_period_report_aggregates_v1(p_current_start timestamp with time zone, p_current_end timestamp with time zone, p_previous_start timestamp with time zone, p_previous_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare report_payload jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_current_start is null or p_current_end is null
    or p_previous_start is null or p_previous_end is null
    or p_current_start > p_current_end
    or p_previous_start > p_previous_end then
    raise exception 'Invalid period bounds' using errcode = '22023';
  end if;

  with periods(label, starts, ends) as (
    values ('current'::text, p_current_start, p_current_end),
           ('previous'::text, p_previous_start, p_previous_end)
  ), ordered as (
    select
      p.label,
      coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
      coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
      m.result,
      row_number() over (
        partition by p.label
        order by m.played_at desc, m.id desc
      ) as ordinal
    from periods p
    join public.matches m
      on m.played_at >= p.starts
      and m.played_at <= p.ends
  ), grouped as (
    select
      label,
      my_id,
      opponent_id,
      count(*) as total,
      count(*) filter (where result = 'win') as wins,
      min(ordinal) as first_ordinal
    from ordered
    group by label, my_id, opponent_id
  ), payloads as (
    select
      label,
      jsonb_build_object(
        'totalMatches', sum(total),
        'groups', jsonb_agg(
          jsonb_build_object(
            'myDeckId', my_id,
            'opponentDeckId', opponent_id,
            'total', total,
            'wins', wins,
            'firstOrdinal', first_ordinal
          )
          order by first_ordinal
        )
      ) as payload
    from grouped
    group by label
  )
  select jsonb_build_object(
    'version', 1,
    'current', coalesce(
      (select payload from payloads where label = 'current'),
      '{"totalMatches":0,"groups":[]}'::jsonb
    ),
    'previous', coalesce(
      (select payload from payloads where label = 'previous'),
      '{"totalMatches":0,"groups":[]}'::jsonb
    )
  )
  into report_payload;

  return report_payload;
end;
$function$;

alter function public.get_period_report_aggregates_v1(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) owner to postgres;

revoke all on function public.get_period_report_aggregates_v1(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) from public, anon, authenticated, service_role;

grant execute on function public.get_period_report_aggregates_v1(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) to postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_analysis_aggregates_v2(p_environment_id uuid DEFAULT NULL::uuid, p_include_all_users boolean DEFAULT false, p_include_reversed boolean DEFAULT false, p_use_archetype boolean DEFAULT true, p_my_deck_id uuid DEFAULT NULL::uuid, p_opponent_deck_id uuid DEFAULT NULL::uuid, p_result match_result DEFAULT NULL::match_result, p_turn_order turn_order DEFAULT NULL::turn_order, p_played_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_played_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_recent_deck_ids uuid[] DEFAULT NULL::uuid[], p_rank_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_rank_filter is not null and p_rank_filter not in ('all', 'master-plus', 'master', 'grandmaster', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond') then
    raise exception 'Invalid analysis rank filter' using errcode = '22023';
  end if;
  return (
  with source_matches as (
    select id, played_at, my_deck_id, opponent_deck_id,
      my_archetype_id, opponent_archetype_id, result, turn_order
    from public.matches m
    where (select auth.uid()) is not null
    -- Rank belongs to the source match owner, before perspective expansion.
    and (p_rank_filter is null or p_rank_filter = 'all'
      or (p_rank_filter = 'master-plus' and m.rank_tier in ('master', 'grandmaster'))
      or (p_rank_filter = 'master' and m.rank_tier = 'master')
      or (p_rank_filter = 'grandmaster' and m.rank_tier = 'grandmaster')
      or (m.rank_tier = 'master' and p_rank_filter = 'master:' || m.master_group)
      or (m.rank_tier = 'grandmaster' and p_rank_filter = 'grandmaster:' || m.grandmaster_rating))
      and (m.user_id = (select auth.uid())
        or (coalesce(p_include_all_users, false) and (select public.is_admin())))
      and (p_environment_id is null or m.environment_id = p_environment_id)
      and (p_played_from is null or m.played_at >= p_played_from)
      and (p_played_to is null or m.played_at <= p_played_to)
  ), perspectives as (
    select s.*, 0 as side from source_matches s
    union all
    select id, played_at, opponent_deck_id, my_deck_id,
      opponent_archetype_id, my_archetype_id,
      case when result = 'win' then 'lose' else 'win' end::public.match_result,
      case when turn_order = 'first' then 'second' else 'first' end::public.turn_order,
      1 as side
    from source_matches where coalesce(p_include_reversed, false)
  ), filtered as (
    select id, played_at, side, result, turn_order,
      coalesce(my_archetype_id, my_deck_id) as my_id,
      coalesce(opponent_archetype_id, opponent_deck_id) as opponent_id,
      case when p_use_archetype then coalesce(my_archetype_id, my_deck_id) else my_deck_id end as card_my_id,
      case when p_use_archetype then coalesce(opponent_archetype_id, opponent_deck_id) else opponent_deck_id end as card_opponent_id
    from perspectives
    where (p_my_deck_id is null or
        (case when p_use_archetype then my_archetype_id else my_deck_id end) = p_my_deck_id)
      and (p_opponent_deck_id is null or
        (case when p_use_archetype then opponent_archetype_id else opponent_deck_id end) = p_opponent_deck_id)
      and (p_result is null or result = p_result)
      and (p_turn_order is null or turn_order = p_turn_order)
  ), ordered as (
    select *, row_number() over (order by played_at desc, id desc, side asc) as position
    from filtered
  ), grouped as (
    select my_id, opponent_id, card_my_id, card_opponent_id, turn_order,
      count(*) as total, count(*) filter (where result = 'win') as wins,
      min(position) as first_position
    from ordered
    group by my_id, opponent_id, card_my_id, card_opponent_id, turn_order
  ), ranked_recent as (
    select *, row_number() over (partition by card_my_id order by position) as deck_position
    from ordered
    where p_recent_deck_ids is null or card_my_id = any(p_recent_deck_ids)
  ), recent as (
    select card_my_id, jsonb_agg(jsonb_build_object(
      'id', id, 'playedAt', played_at, 'source', case when side = 0 then 'direct' else 'reversed' end,
      'result', result, 'turnOrder', turn_order, 'order', position
    ) order by position) as views
    from ranked_recent where deck_position <= 10
    group by card_my_id
  )
  select jsonb_build_object(
    'version', 1,
    'registeredMatches', count(distinct id),
    'perspectives', count(*),
    'totalWins', count(*) filter (where result = 'win'),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
      'myDeckId', my_id, 'opponentDeckId', opponent_id,
      'cardMyDeckId', card_my_id, 'cardOpponentDeckId', card_opponent_id,
      'turnOrder', turn_order, 'total', total, 'wins', wins, 'firstOrder', first_position
    ) order by first_position), '[]'::jsonb) from grouped),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
      'deckId', card_my_id, 'views', views
    )), '[]'::jsonb) from recent)
  ) from ordered
  );
end;
$function$;

alter function public.get_analysis_aggregates_v2(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[],text) owner to postgres;

revoke all on function public.get_analysis_aggregates_v2(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[],text) from public, anon, authenticated, service_role;

grant execute on function public.get_analysis_aggregates_v2(uuid,boolean,boolean,boolean,uuid,uuid,match_result,turn_order,timestamp with time zone,timestamp with time zone,uuid[],text) to postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_matchup_aggregates_v2(p_environment_id uuid DEFAULT NULL::uuid, p_include_all_users boolean DEFAULT false, p_rank_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_rank_filter is not null and p_rank_filter not in ('all', 'master-plus', 'master', 'grandmaster', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond') then
    raise exception 'Invalid matchup rank filter' using errcode = '22023';
  end if;
  -- v1 group array order is unspecified. Delegate all to preserve exact JSON.
  if p_rank_filter is null or p_rank_filter = 'all' then
    return public.get_matchup_aggregates_v1(p_environment_id, p_include_all_users);
  end if;
  -- Rank filters the original registration before grouping; totals and cells
  -- are derived from this same grouped population, including hidden IDs.
  return (
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
    and (p_rank_filter is null or p_rank_filter = 'all'
      or (p_rank_filter = 'master-plus' and m.rank_tier in ('master', 'grandmaster'))
      or (p_rank_filter = 'master' and m.rank_tier = 'master')
      or (p_rank_filter = 'grandmaster' and m.rank_tier = 'grandmaster')
      or (m.rank_tier = 'master' and p_rank_filter = 'master:' || m.master_group)
      or (m.rank_tier = 'grandmaster' and p_rank_filter = 'grandmaster:' || m.grandmaster_rating))
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
  from grouped
  );
end;
$function$;

alter function public.get_matchup_aggregates_v2(uuid,boolean,text) owner to postgres;

revoke all on function public.get_matchup_aggregates_v2(uuid,boolean,text) from public, anon, authenticated, service_role;

grant execute on function public.get_matchup_aggregates_v2(uuid,boolean,text) to postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_period_report_aggregates_v2(p_current_start timestamp with time zone, p_current_end timestamp with time zone, p_previous_start timestamp with time zone, p_previous_end timestamp with time zone, p_rank_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare report_payload jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_current_start is null or p_current_end is null or p_previous_start is null or p_previous_end is null
    or p_current_start > p_current_end or p_previous_start > p_previous_end then
    raise exception 'Invalid period bounds' using errcode = '22023';
  end if;

  if p_rank_filter is not null and p_rank_filter not in ('all', 'master-plus', 'master', 'grandmaster', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond') then
    raise exception 'Invalid period report rank filter' using errcode = '22023';
  end if;
  if p_rank_filter is null or p_rank_filter = 'all' then
    return public.get_period_report_aggregates_v1(p_current_start, p_current_end, p_previous_start, p_previous_end);
  end if;

  with periods(label, starts, ends) as (
    values ('current'::text, p_current_start, p_current_end),
           ('previous'::text, p_previous_start, p_previous_end)
  ), ordered as (
    select p.label, coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
      coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
      m.result,
      row_number() over (partition by p.label order by m.played_at desc, m.id desc) as ordinal
    from periods p join public.matches m on m.played_at >= p.starts and m.played_at <= p.ends
    where (p_rank_filter = 'master-plus' and m.rank_tier in ('master', 'grandmaster'))
      or (p_rank_filter = 'master' and m.rank_tier = 'master')
      or (p_rank_filter = 'grandmaster' and m.rank_tier = 'grandmaster')
      or (m.rank_tier = 'master' and p_rank_filter = 'master:' || m.master_group)
      or (m.rank_tier = 'grandmaster' and p_rank_filter = 'grandmaster:' || m.grandmaster_rating)
  ), grouped as (
    select label, my_id, opponent_id, count(*) as total,
      count(*) filter (where result = 'win') as wins, min(ordinal) as first_ordinal
    from ordered group by label, my_id, opponent_id
  ), payloads as (
    select label, jsonb_build_object('totalMatches', sum(total), 'groups',
      jsonb_agg(jsonb_build_object('myDeckId', my_id, 'opponentDeckId', opponent_id,
        'total', total, 'wins', wins, 'firstOrdinal', first_ordinal) order by first_ordinal)) as payload
    from grouped group by label
  )
  select jsonb_build_object('version', 1,
    'current', coalesce((select payload from payloads where label = 'current'), '{"totalMatches":0,"groups":[]}'::jsonb),
    'previous', coalesce((select payload from payloads where label = 'previous'), '{"totalMatches":0,"groups":[]}'::jsonb))
  into report_payload;
  return report_payload;
end;
$function$;

alter function public.get_period_report_aggregates_v2(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text) owner to postgres;

revoke all on function public.get_period_report_aggregates_v2(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text) from public, anon, authenticated, service_role;

grant execute on function public.get_period_report_aggregates_v2(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text) to postgres, authenticated, service_role;

alter table public."admin_users" enable row level security;

alter table public."deck_aliases" enable row level security;

alter table public."deck_archetypes" enable row level security;

alter table public."deck_suggestions" enable row level security;

alter table public."decks" enable row level security;

alter table public."environments" enable row level security;

alter table public."matches" enable row level security;

alter table public."profiles" enable row level security;

alter table public."user_decks" enable row level security;

create policy "admin_users_select_own_or_admin" on public."admin_users" as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR is_admin()));

create policy "deck_aliases_admin_delete" on public."deck_aliases" as PERMISSIVE for DELETE to public using (is_admin());

create policy "deck_aliases_admin_insert" on public."deck_aliases" as PERMISSIVE for INSERT to public with check (is_admin());

create policy "deck_aliases_select_all" on public."deck_aliases" as PERMISSIVE for SELECT to public using (true);

create policy "deck_archetypes_admin_insert" on public."deck_archetypes" as PERMISSIVE for INSERT to public with check (is_admin());

create policy "deck_archetypes_admin_update" on public."deck_archetypes" as PERMISSIVE for UPDATE to public using (is_admin()) with check (is_admin());

create policy "deck_archetypes_select_all" on public."deck_archetypes" as PERMISSIVE for SELECT to public using (true);

create policy "deck_archetypes_select_public" on public."deck_archetypes" as PERMISSIVE for SELECT to "anon", "authenticated" using ((is_active = true));

create policy "deck_suggestions_admin_update" on public."deck_suggestions" as PERMISSIVE for UPDATE to public using (is_admin()) with check (is_admin());

create policy "deck_suggestions_insert_own" on public."deck_suggestions" as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));

create policy "deck_suggestions_select_own_or_admin" on public."deck_suggestions" as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR is_admin()));

create policy "decks_delete_own" on public."decks" as PERMISSIVE for DELETE to "authenticated" using ((auth.uid() = user_id));

create policy "decks_insert_own" on public."decks" as PERMISSIVE for INSERT to "authenticated" with check ((auth.uid() = user_id));

create policy "decks_select_own" on public."decks" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() = user_id));

create policy "decks_update_own" on public."decks" as PERMISSIVE for UPDATE to "authenticated" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create policy "environments_delete_own" on public."environments" as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));

create policy "environments_insert_own" on public."environments" as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));

create policy "environments_select_own" on public."environments" as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));

create policy "environments_select_public" on public."environments" as PERMISSIVE for SELECT to "anon", "authenticated" using (true);

create policy "environments_update_own" on public."environments" as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create policy "matches_delete_own" on public."matches" as PERMISSIVE for DELETE to "authenticated" using ((auth.uid() = user_id));

create policy "matches_insert_own" on public."matches" as PERMISSIVE for INSERT to "authenticated" with check (((auth.uid() = user_id) AND (environment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM environments e
  WHERE ((e.id = matches.environment_id) AND (e.allow_match_input = true)))) AND (EXISTS ( SELECT 1
   FROM decks d
  WHERE ((d.id = matches.my_deck_id) AND (d.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM decks d
  WHERE ((d.id = matches.opponent_deck_id) AND (d.user_id = auth.uid()))))));

create policy "matches_select_own_or_admin" on public."matches" as PERMISSIVE for SELECT to "authenticated" using (((auth.uid() = user_id) OR is_admin()));

create policy "matches_update_own" on public."matches" as PERMISSIVE for UPDATE to "authenticated" using ((auth.uid() = user_id)) with check (((auth.uid() = user_id) AND (environment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM environments e
  WHERE ((e.id = matches.environment_id) AND (e.allow_match_input = true)))) AND (EXISTS ( SELECT 1
   FROM decks d
  WHERE ((d.id = matches.my_deck_id) AND (d.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM decks d
  WHERE ((d.id = matches.opponent_deck_id) AND (d.user_id = auth.uid()))))));

create policy "profiles_select_own" on public."profiles" as PERMISSIVE for SELECT to public using ((auth.uid() = id));

create policy "profiles_update_own" on public."profiles" as PERMISSIVE for UPDATE to public using ((auth.uid() = id)) with check ((auth.uid() = id));

create policy "user_decks_insert_own" on public."user_decks" as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));

create policy "user_decks_select_own" on public."user_decks" as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));

create policy "user_decks_update_own" on public."user_decks" as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER deck_archetypes_set_updated_at BEFORE UPDATE ON public.deck_archetypes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER deck_suggestions_set_updated_at BEFORE UPDATE ON public.deck_suggestions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_decks_set_updated_at BEFORE UPDATE ON public.user_decks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

revoke all on table public."admin_users" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."admin_users" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."admin_users" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."admin_users" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."admin_users" to service_role;

revoke all on table public."deck_aliases" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_aliases" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_aliases" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_aliases" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_aliases" to service_role;

revoke all on table public."deck_archetypes" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_archetypes" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_archetypes" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_archetypes" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_archetypes" to service_role;

revoke all on table public."deck_suggestions" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_suggestions" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_suggestions" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_suggestions" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."deck_suggestions" to service_role;

revoke all on table public."decks" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."decks" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."decks" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."decks" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."decks" to service_role;

revoke all on table public."environments" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."environments" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."environments" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."environments" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."environments" to service_role;

revoke all on table public."matches" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."matches" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."matches" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."matches" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."matches" to service_role;

revoke all on table public."profiles" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."profiles" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."profiles" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."profiles" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."profiles" to service_role;

revoke all on table public."user_decks" from public, anon, authenticated, service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."user_decks" to postgres;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."user_decks" to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."user_decks" to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, MAINTAIN on table public."user_decks" to service_role;

alter default privileges for role "postgres" in schema public grant select, update, usage on sequences to postgres, anon, authenticated, service_role;

alter default privileges for role "postgres" in schema public grant execute on functions to postgres, anon, authenticated, service_role;

alter default privileges for role "postgres" in schema public grant select, insert, update, delete, truncate, references, trigger, maintain on tables to postgres, anon, authenticated, service_role;

commit;
