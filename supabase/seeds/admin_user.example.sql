-- Register an administrator.
-- Replace ADMIN_AUTH_USER_ID with the target user's auth.users.id.
-- Example: insert into public.admin_users (user_id) values ('7b59d173-4ee0-40da-9786-47a39aee40d7');

insert into public.admin_users (user_id)
values ('ADMIN_AUTH_USER_ID')
on conflict (user_id) do nothing;
