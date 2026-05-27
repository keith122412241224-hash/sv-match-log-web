-- Initial environment data.
-- Replace ADMIN_AUTH_USER_ID with an auth.users.id that is registered in admin_users.

insert into public.environments (user_id, name, start_date, memo)
select 'ADMIN_AUTH_USER_ID', '初期環境', null, '初期登録データ'
where not exists (
  select 1
  from public.environments
  where name = '初期環境'
);
