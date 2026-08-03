-- follow-notifications.sql (P5 — 2026-08-02)
-- Applied to production via MCP as migration `follow_notifications`.
--
--   row 24 התראות למי שעשה סבסקריפשן לעמוד קבוצה כלשהי על קיום המשחק ואירועים במשחק
--
-- Only followers who explicitly switched `notify` on are reached — following shapes the
-- feed, the bell is a second, separate opt-in.
--
-- Scope note: "אירועים במשחק" is delivered here as the FINAL RESULT, not a push per
-- goal. game_stats is not a live event stream — judge_save_game_result replaces the
-- whole box score once at the end — so per-goal alerts would need a hook into
-- live_game_state, and would mean a phone buzzing on every goal. Say the word if you
-- want that; it is a deliberate omission, not an oversight.

-- Followers of either team, or of any player turning out for them, who asked to be told.
create or replace function public.game_followers(p_game uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select distinct f.user_id
  from public.follows f
  join public.games g on g.id = p_game
  where f.notify
    and (
      (f.target_type = 'team' and f.target_id in (g.home_team_id, g.away_team_id))
      or (f.target_type = 'player' and exists (
            select 1 from public.players p
            where p.id = f.target_id
              and (p.team_id in (g.home_team_id, g.away_team_id)
                   or exists (select 1 from public.player_teams pt
                              where pt.player_id = p.id
                                and pt.team_id in (g.home_team_id, g.away_team_id)))))
    )
$$;
revoke all on function public.game_followers(uuid) from public, anon;
grant execute on function public.game_followers(uuid) to authenticated;

-- "קיום המשחק": one heads-up the day before. Joins the existing hourly sweep as a rule
-- row, so its timing is tunable like every other reminder.
insert into public.notification_rules (kind, days_before, hour_local, repeats)
values ('follower_game_alert', 1, 18, false)
on conflict (kind) do nothing;

-- Final result → followers, on top of the players already notified by the original
-- trigger. The NOT EXISTS keeps a follower who also played from being told twice.
create or replace function public.notify_on_game_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_home text; v_away text; v_payload jsonb;
begin
  if NEW.status = 'completed' and OLD.status is distinct from NEW.status then
    select name into v_home from public.teams where id = NEW.home_team_id;
    select name into v_away from public.teams where id = NEW.away_team_id;
    v_payload := jsonb_build_object(
      'home_team', coalesce(v_home, ''), 'away_team', coalesce(v_away, ''),
      'home_score', NEW.home_score, 'away_score', NEW.away_score);

    -- players who appeared in the box score (unchanged behaviour)
    insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
    select distinct pr.id, 'game_result', null, 'game', NEW.id::text, v_payload
    from public.game_stats gs
    join public.profiles pr on pr.player_id = gs.player_id
    where gs.game_id = NEW.id;

    -- followers who opted into notifications, minus anyone already covered above
    insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
    select f.user_id, 'game_result', null, 'game', NEW.id::text, v_payload
    from public.game_followers(NEW.id) f
    where not exists (
      select 1 from public.game_stats gs
      join public.profiles pr on pr.player_id = gs.player_id
      where gs.game_id = NEW.id and pr.id = f.user_id
    );
  end if;
  return null;
exception when others then return null;
end;
$$;
