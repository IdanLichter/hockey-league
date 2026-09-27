-- Birthday celebrations (2026-09-27)
--
-- Every morning a "יום הולדת שמח" post goes into the feed for each player whose birthday
-- is today (Israel time). It is an ordinary `posts` row by the bot author, so web, iOS and
-- Android all show it with no app release, and likes/comments work on it for free.
--
-- Privacy: the post never carries a date or an age — only "today". birth_date stays
-- unreadable to clients (see players-birth-date-authenticated.sql); everything that reads
-- it here is SECURITY DEFINER and returns no date.
--
-- Opt-OUT: players.celebrate_birthday defaults to true. The linked player turns it off from
-- /me via set_birthday_celebration(false), which also removes today's post if it is already up.
-- Minors are celebrated the same way (Ariel's decision, 2026-09-27).
--
-- Rollback: birthday-celebrations-down.sql

alter table public.players
  add column if not exists celebrate_birthday boolean not null default true;

-- players has column-level grants (no table-level SELECT). The flag is harmless to read,
-- but only signed-in clients need it.
grant select (celebrate_birthday) on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- The daily job. Idempotent: external_guid = birthday:<player>:<year>, unique, so running
-- it twice a day (DST fallback) or by hand never double-posts, and a post a moderator
-- deleted stays deleted.
create or replace function public.post_birthdays()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  bot uuid;
  n int := 0;
  r record;
begin
  select id into bot from public.profiles where is_bot order by created_at limit 1;
  if bot is null then
    raise exception 'no bot profile';
  end if;

  for r in
    select p.id, p.first_name, p.last_name, p.slug, p.photo_url, p.team_id
    from public.players p
    where p.birth_date is not null
      and p.celebrate_birthday
      and (
        (extract(month from p.birth_date) = extract(month from today)
         and extract(day from p.birth_date) = extract(day from today))
        -- 29 Feb birthdays are celebrated on 28 Feb in non-leap years.
        or (extract(month from p.birth_date) = 2 and extract(day from p.birth_date) = 29
            and extract(month from today) = 2 and extract(day from today) = 28
            and extract(day from (make_date(extract(year from today)::int, 3, 1) - 1)) = 28)
      )
  loop
    insert into public.posts (author_id, body, team_id, source_name, link_url, image_url, external_guid)
    values (
      bot,
      '🎂 יום הולדת שמח ל' || trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
        || '! כל הליגה מאחלת מזל טוב — כתבו ברכה בתגובות 👇',
      r.team_id,
      'יום הולדת',
      'https://rinkhockeyil.com/players/' || coalesce(r.slug, r.id::text),
      nullif(r.photo_url, ''),
      'birthday:' || r.id || ':' || extract(year from today)::int
    )
    on conflict (external_guid) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.post_birthdays() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- /me: read + set the signed-in user's own flag. Scoped to the player linked to the
-- caller's profile — nobody can switch someone else's off (admins can via SQL).
create or replace function public.my_birthday_celebration()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object(
              'linked', true,
              'has_birth_date', p.birth_date is not null,
              'celebrate', p.celebrate_birthday)
       from public.profiles pr
       join public.players p on p.id = pr.player_id
      where pr.id = auth.uid()),
    jsonb_build_object('linked', false, 'has_birth_date', false, 'celebrate', false));
$$;

create or replace function public.set_birthday_celebration(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare pid uuid;
begin
  select player_id into pid from public.profiles where id = auth.uid();
  if pid is null then
    raise exception 'not_linked' using hint = 'this account is not linked to a player';
  end if;
  update public.players set celebrate_birthday = coalesce(p_on, true) where id = pid;
  -- Turning it off on the day itself also takes down the post that already went up.
  if not coalesce(p_on, true) then
    update public.posts set deleted_at = now()
     where external_guid like 'birthday:' || pid || ':%' and deleted_at is null;
  end if;
  return coalesce(p_on, true);
end $$;

revoke all on function public.my_birthday_celebration() from public, anon;
revoke all on function public.set_birthday_celebration(boolean) from public, anon;
grant execute on function public.my_birthday_celebration() to authenticated;
grant execute on function public.set_birthday_celebration(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 04:07 UTC = 07:07 Israel in summer, 06:07 in winter. A second attempt at 09:07 UTC is free
-- (guid dedupe) and covers a missed run.
select cron.unschedule('birthday-posts') where exists (select 1 from cron.job where jobname = 'birthday-posts');
select cron.schedule('birthday-posts', '7 4,9 * * *', 'select public.post_birthdays();');
