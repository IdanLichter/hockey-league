-- officials-contact.sql (P3 — 2026-08-02)
-- Applied to production via MCP as migration `officials_contact`.
--
--   row 16 שופט שנרשם למשחק עם שם מלא
--   row 17 חובש שנרשם למשחק עם שם מלא וטלפון בטופס המשחק
--
-- The storage landed in P0 (user-contact.sql) — deliberately its own table, because
-- `profiles` is world-readable and a phone there would be public. This file adds the
-- write path and makes the details a PRECONDITION of applying: a medic with no phone on
-- the sheet is exactly the failure row 17 is written to catch, so it is refused at the
-- RPC rather than discovered on match day.

-- Save my own name/phone. An RPC rather than a PostgREST upsert so the phone is
-- normalised once, server-side, instead of in every caller.
create or replace function public.save_my_contact(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name  text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s\-()]', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- Loose on purpose: Israeli mobiles, landlines and +972 forms all have to pass, and a
  -- rejected real number is worse than an odd-looking one the manager can eyeball.
  if v_phone is not null and v_phone !~ '^\+?[0-9]{9,15}$' then
    raise exception 'bad phone';
  end if;
  insert into public.user_contact (user_id, full_name, phone, updated_at)
  values ((select auth.uid()), v_name, v_phone, now())
  on conflict (user_id) do update
    set full_name = excluded.full_name, phone = excluded.phone, updated_at = now();
end;
$$;
revoke all on function public.save_my_contact(text, text) from public, anon;
grant execute on function public.save_my_contact(text, text) to authenticated;

-- Applying to work a game now requires the details the game sheet will need.
-- Extends supabase/officials.sql.
create or replace function public.apply_as_official(p_game_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_phone text;
begin
  if p_role not in ('judge','medic') then raise exception 'bad role'; end if;
  if p_role = 'judge' and not (public.is_admin() or public.is_judge()) then raise exception 'not authorized'; end if;
  if p_role = 'medic' and not (public.is_admin() or public.is_medic()) then raise exception 'not authorized'; end if;

  select full_name, phone into v_name, v_phone
    from public.user_contact where user_id = (select auth.uid());

  -- row 16: a display name like "אריאל" is not enough for an official record
  if coalesce(btrim(v_name), '') = '' then raise exception 'missing full name'; end if;
  -- row 17: the medic is the person you phone when someone is hurt
  if p_role = 'medic' and coalesce(btrim(v_phone), '') = '' then raise exception 'missing phone'; end if;

  insert into public.game_officials (game_id, user_id, role, status, created_by)
    values (p_game_id, (select auth.uid()), p_role, 'applied', (select auth.uid()))
    on conflict (game_id, role, user_id) do nothing;

  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, data)
  select distinct u, 'official_application', (select auth.uid()), 'game', p_game_id::text,
         jsonb_build_object('role', p_role)
  from ( select ur.user_id as u from public.user_roles ur where ur.role = 'league_manager'
         union
         select usr.id from public.admin_users au
           join auth.users usr on lower(usr.email) = lower(au.email) ) t(u)
  where u is not null and u <> (select auth.uid());
end;
$$;
revoke all on function public.apply_as_official(uuid, text) from public, anon;
grant execute on function public.apply_as_official(uuid, text) to authenticated;

-- Correction to game-reminders.sql: the Tuesday/Thursday officials digest must not count
-- an APPLIED official. An application still awaiting the manager's approval is precisely
-- what the digest exists to prompt him about — counting it as "covered" would tell him
-- everything is fine while the slot is in fact unfilled.
--
-- AMENDED 2026-08-15 (migration `officials_assigned_status_collapse`): the original wrote
-- `status = 'approved'`, which dropped 'assigned' along with 'applied' and so reported
-- "0 judges, 0 medics" for games that had both. Counts both confirmed statuses now.
-- AMENDED 2026-09-12 (migration `reminders_skip_ineligible_players`): the recipient loop
-- filtered on team membership and "hasn't answered" only, so a suspended player, or one
-- with no approved medical, was nagged every single day to do something the registration
-- gate would refuse. And coach_digest's "pending" count both included those same players
-- AND scoped its roster on p.team_id alone — missing the player_teams multi-age members
-- the recipient loop above it already included. Both fixed below.
--
-- This is the CURRENT deployed body (it also carries the follower_game_alert branch).

-- The three conditions the registration gate itself applies, in one place so the
-- reminders and the gate cannot drift apart. NOT granted to authenticated: it would
-- answer "does player X have a valid medical?" for anyone who asked.
create or replace function public.can_register_for_game(p_player uuid, p_game uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce(public.is_suspended(p_player), false)
     and not coalesce(public.is_unavailable(
           p_player,
           coalesce((select g.game_date::date from public.games g where g.id = p_game),
                    current_date)), false)
     and exists (
       select 1 from public.medical_certificates mc
        where mc.player_id = p_player
          and mc.status = 'approved'
          and (mc.expires_at is null or mc.expires_at >= current_date))
$$;
revoke execute on function public.can_register_for_game(uuid, uuid) from public, anon, authenticated;

create or replace function public.send_game_reminder(p_kind text, p_game uuid, p_for date)
returns integer
language plpgsql security definer set search_path = public as $$
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
        -- A2: suspended, medically unapproved, or on an approved absence — the gate
        -- would refuse him, so the reminder is only noise.
        and public.can_register_for_game(p.id, g.id)
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

  elsif p_kind = 'coach_digest' then
    for rec in
      select ur.user_id, ur.team_id
      from public.user_roles ur
      where ur.role = 'coach' and ur.team_id in (g.home_team_id, g.away_team_id)
    loop
      -- A2, two fixes. The roster is now the same set the recipient loop above uses —
      -- players.team_id OR player_teams — so a multi-age squad member is no longer
      -- invisible to his own coach's digest. And "pending" means players who could
      -- still answer: counting a suspended or medical-less player as "טרם הגיב" told
      -- the coach to go chase someone the server will refuse.
      select count(*) filter (where ga.status = 'available'),
             count(*) filter (where ga.status = 'unavailable'),
             count(*) filter (where ga.id is null
                                and public.can_register_for_game(p.id, g.id))
        into v_yes, v_no, v_pending
        from public.players p
        left join public.game_availability ga
               on ga.game_id = g.id and ga.player_id = p.id
       where p.team_id = rec.team_id
          or exists (select 1 from public.player_teams pt
                     where pt.player_id = p.id and pt.team_id = rec.team_id);

      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id, 'coach_squad_digest', null, 'game', p_game::text,
          base || jsonb_build_object('yes', v_yes, 'no', v_no, 'pending', v_pending));
        n := n + 1;
      end if;
    end loop;

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

  elsif p_kind in ('lm_officials_early', 'lm_officials_late') then
    select count(*) filter (where go.role = 'judge'),
           count(*) filter (where go.role = 'medic')
      into v_judges, v_medics
      from public.game_officials go
     where go.game_id = g.id and go.status in ('assigned', 'approved');

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
  elsif p_kind = 'follower_game_alert' then
    for rec in select user_id from public.game_followers(p_game) loop
      insert into public.game_reminder_log (game_id, kind, user_id, sent_for)
      values (p_game, p_kind, rec.user_id, p_for) on conflict do nothing;
      if found then
        perform public.create_notification(
          rec.user_id, 'follow_game_alert', null, 'game', p_game::text, base);
        n := n + 1;
      end if;
    end loop;
  end if;

  return n;
end;
$$;
revoke all on function public.send_game_reminder(text, uuid, date) from public, anon, authenticated;
