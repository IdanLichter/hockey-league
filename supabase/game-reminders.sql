-- game-reminders.sql (P2 — 2026-08-02)
-- Applied to production via MCP as migration `game_reminders`.
--
-- The scheduled reminders from the test sheet:
--   row 1  התראה על המשחק שמזכירה להרשם
--   row 9  שחקן שלא נרשם מקבל התראה נוספת ביום שלישי בבוקר
--   row 10 המאמן מקבל התראה ביום שלישי אחה"צ על שחקנים שלא סימנו הגעה / אי הגעה
--   row 12 התראה למנהל הליגה ביום חמישי אחה"צ שיש / אין סגלים למשחק
--   row 18 התראות למנהל שופטים בשלישי ובחמישי אחה"צ על הגעת שופט וחובש
--          (מנהל שופטים = מנהל הליגה — no separate role)
--
-- Timing is RELATIVE to kickoff, as decided, but expressed as (days_before, hour_local)
-- rather than raw hours. Kickoffs range from 15:30 to 23:00, so a pure hour offset would
-- drift "Tuesday morning" across the afternoon depending on the fixture. Days + a local
-- clock hour lands on the intended weekday AND at a civilised time, and still moves with
-- the game if it is rescheduled.
--
-- Row 9 repeats: per the decision ("as many as it takes") the nudge goes out every day
-- from days_before down to the day before the game, to anyone who still has not answered.
-- It stops the moment he answers, because the recipient query filters on that.

-- ---------------------------------------------------------------------------
-- Rules — editable rows, not hardcoded constants.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_rules (
  kind        text primary key,
  days_before int  not null check (days_before >= 0),
  hour_local  int  not null check (hour_local between 0 and 23),
  repeats     boolean not null default false,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.notification_rules (kind, days_before, hour_local, repeats) values
  ('register_reminder',  6, 18, false),   -- row 1  → Sunday evening for a Saturday game
  ('register_nudge',     4,  8, true),    -- row 9  → Tuesday morning, then daily
  ('coach_digest',       4, 17, false),   -- row 10 → Tuesday afternoon
  ('lm_squads',          2, 17, false),   -- row 12 → Thursday afternoon
  ('lm_officials_early', 4, 17, false),   -- row 18 → Tuesday afternoon
  ('lm_officials_late',  2, 17, false)    -- row 18 → Thursday afternoon
on conflict (kind) do nothing;

alter table public.notification_rules enable row level security;
drop policy if exists "read rules" on public.notification_rules;
create policy "read rules" on public.notification_rules
  for select using (public.is_admin() or public.is_league_manager());
drop policy if exists "admin edits rules" on public.notification_rules;
create policy "admin edits rules" on public.notification_rules
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Idempotency. sent_for is the LOCAL date the reminder was scheduled for, which is what
-- makes a repeating nudge work: one row per recipient per day, so an hourly cron that
-- runs twice (or a retry) cannot double-send, while tomorrow's nudge is still allowed.
-- ---------------------------------------------------------------------------
create table if not exists public.game_reminder_log (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games(id) on delete cascade,
  kind      text not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  sent_for  date not null,
  sent_at   timestamptz not null default now(),
  unique (game_id, kind, user_id, sent_for)
);
create index if not exists game_reminder_log_game_idx on public.game_reminder_log(game_id);

-- Internal bookkeeping: RLS on with no policies, so only the definer functions below
-- can read or write it.
alter table public.game_reminder_log enable row level security;

-- Admins + league managers, deduped. The league manager is also the judge manager.
create or replace function public.manager_user_ids()
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select u.id from auth.users u join public.admin_users a on a.email = u.email
  union
  select ur.user_id from public.user_roles ur where ur.role = 'league_manager'
$$;

-- ---------------------------------------------------------------------------
-- Fan-out for one (kind, game, date). Returns how many notifications it created.
-- ---------------------------------------------------------------------------
create or replace function public.send_game_reminder(p_kind text, p_game uuid, p_for date)
returns int language plpgsql security definer set search_path = public as $$
declare
  g       record;
  rec     record;
  base    jsonb;
  n       int := 0;
  v_yes   int; v_no int; v_pending int;
  v_home_yes int; v_away_yes int;
  v_judges int; v_medics int;
begin
  select gm.id, gm.game_date, gm.home_team_id, gm.away_team_id,
         th.name as home_name, ta.name as away_name
    into g
    from public.games gm
    left join public.teams th on th.id = gm.home_team_id
    left join public.teams ta on ta.id = gm.away_team_id
   where gm.id = p_game;
  if not found then return 0; end if;

  base := jsonb_build_object(
    'home_team', coalesce(g.home_name, ''),
    'away_team', coalesce(g.away_name, ''),
    'game_date', g.game_date
  );

  -- ---- rows 1 + 9: the players themselves --------------------------------
  if p_kind in ('register_reminder', 'register_nudge') then
    for rec in
      select distinct pr.id as user_id
      from public.players p
      join public.profiles pr on pr.player_id = p.id
      where (
              p.team_id in (g.home_team_id, g.away_team_id)
              or exists (select 1 from public.player_teams pt
                         where pt.player_id = p.id
                           and pt.team_id in (g.home_team_id, g.away_team_id))
            )
        -- the nudge is only for those who still have not answered; it stops by itself
        and (p_kind = 'register_reminder'
             or not exists (select 1 from public.game_availability ga
                            where ga.game_id = g.id and ga.player_id = p.id))
    loop
      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id,
          case p_kind when 'register_reminder' then 'game_register_reminder'
                      else 'game_register_nudge' end,
          null, 'game', p_game::text, base);
        n := n + 1;
      end if;
    end loop;

  -- ---- row 10: each coach, about HIS OWN team ----------------------------
  elsif p_kind = 'coach_digest' then
    for rec in
      select ur.user_id, ur.team_id
      from public.user_roles ur
      where ur.role = 'coach' and ur.team_id in (g.home_team_id, g.away_team_id)
    loop
      select count(*) filter (where ga.status = 'available'),
             count(*) filter (where ga.status = 'unavailable'),
             count(*) filter (where ga.id is null)
        into v_yes, v_no, v_pending
        from public.players p
        left join public.game_availability ga
               on ga.game_id = g.id and ga.player_id = p.id
       where p.team_id = rec.team_id;

      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id, 'coach_squad_digest', null, 'game', p_game::text,
          base || jsonb_build_object('yes', v_yes, 'no', v_no, 'pending', v_pending));
        n := n + 1;
      end if;
    end loop;

  -- ---- row 12: the league manager, about both squads ---------------------
  elsif p_kind = 'lm_squads' then
    select count(*) filter (where ga.status = 'available' and coalesce(ga.team_id, p.team_id) = g.home_team_id),
           count(*) filter (where ga.status = 'available' and coalesce(ga.team_id, p.team_id) = g.away_team_id)
      into v_home_yes, v_away_yes
      from public.game_availability ga
      join public.players p on p.id = ga.player_id
     where ga.game_id = g.id;

    for rec in select user_id from public.manager_user_ids() loop
      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id, 'lm_squad_digest', null, 'game', p_game::text,
          base || jsonb_build_object('home_count', coalesce(v_home_yes, 0),
                                     'away_count', coalesce(v_away_yes, 0)));
        n := n + 1;
      end if;
    end loop;

  -- ---- row 18: the league manager, about judge + medic -------------------
  elsif p_kind in ('lm_officials_early', 'lm_officials_late') then
    select count(*) filter (where go.role = 'judge'),
           count(*) filter (where go.role = 'medic')
      into v_judges, v_medics
      from public.game_officials go
     where go.game_id = g.id and coalesce(go.status, '') <> 'rejected';

    for rec in select user_id from public.manager_user_ids() loop
      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id, 'lm_officials_digest', null, 'game', p_game::text,
          base || jsonb_build_object('judges', coalesce(v_judges, 0),
                                     'medics', coalesce(v_medics, 0)));
        n := n + 1;
      end if;
    end loop;
  end if;

  return n;
end;
$$;
revoke all on function public.send_game_reminder(text, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The hourly sweep. Walks upcoming games, and for each enabled rule works out the local
-- moment it should fire; if that moment falls inside the current hour, it fans out.
-- Safe to run by hand and safe to run twice — the log's unique key absorbs repeats.
-- ---------------------------------------------------------------------------
create or replace function public.run_game_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_now    timestamptz := now();
  v_sent   int := 0;
  g        record;
  rule     record;
  d        int;
  v_target timestamptz;
begin
  for g in
    select id, game_date from public.games
     where status in ('scheduled', 'postponed')
       and game_date > v_now
       and game_date < v_now + interval '30 days'
  loop
    for rule in select * from public.notification_rules where enabled loop
      -- a repeating rule fires on every day from days_before down to 1
      for d in select generate_series(case when rule.repeats then 1 else rule.days_before end,
                                      rule.days_before)
      loop
        v_target := (((g.game_date at time zone 'Asia/Jerusalem')::date - d)
                     + make_interval(hours => rule.hour_local)) at time zone 'Asia/Jerusalem';
        if date_trunc('hour', v_target) = date_trunc('hour', v_now) then
          v_sent := v_sent + public.send_game_reminder(
            rule.kind, g.id, (v_target at time zone 'Asia/Jerusalem')::date);
        end if;
      end loop;
    end loop;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.run_game_reminders() from public, anon, authenticated;
grant execute on function public.run_game_reminders() to service_role;

-- Hourly, at five past. The function resolves Israel local time itself, so the cron
-- timezone (UTC) does not matter and DST needs no special handling.
do $$ begin perform cron.unschedule('game-reminders'); exception when others then null; end $$;
select cron.schedule('game-reminders', '5 * * * *', $$select public.run_game_reminders();$$);
