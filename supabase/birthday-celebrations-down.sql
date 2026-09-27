-- Rollback for birthday-celebrations.sql. Leaves already-posted birthday posts in place.
select cron.unschedule('birthday-posts') where exists (select 1 from cron.job where jobname = 'birthday-posts');
drop function if exists public.post_birthdays();
drop function if exists public.set_birthday_celebration(boolean);
drop function if exists public.my_birthday_celebration();
alter table public.players drop column if exists celebrate_birthday;
