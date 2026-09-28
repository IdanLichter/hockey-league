-- Coaches get read-only, own-squad views of הרחקות and מוכנות להתראות (2026-09-28).
--
-- Both RPCs were admin / league-manager (/ judge) only. A coach is the person who has
-- to know which of HIS players can't play Saturday, and the one who can actually get
-- them to install the app and allow push. Same shape as medical_roster(): everyone
-- entitled to the league sees all rows; a coach sees rows is_coach_of_player() admits
-- (primary team OR a player_teams membership). Writes are unchanged — issuing /
-- clearing a suspension stays with judges and managers.

create or replace function public.active_suspensions()
returns table(id uuid, player_id uuid, first_name text, last_name text, team_id uuid,
              team_name text, reason text, games_remaining integer, issued_game_id uuid,
              created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_all boolean;
begin
  v_all := coalesce(public.is_admin(), false) or coalesce(public.is_league_manager(), false)
        or coalesce(public.is_judge(), false);
  if not (v_all or coalesce(public.is_coach(), false)) then raise exception 'not authorized'; end if;
  return query
    select s.id, s.player_id, p.first_name, p.last_name, p.team_id, t.name as team_name,
           s.reason, s.games_remaining, s.issued_game_id, s.created_at
      from public.player_suspensions s
      join public.players p on p.id = s.player_id
      left join public.teams t on t.id = p.team_id
     where s.cleared_at is null and s.games_remaining > 0
       and (v_all or public.is_coach_of_player(p.id))
     order by s.created_at desc;
end;
$function$;

create or replace function public.notification_readiness()
returns table(player_id uuid, first_name text, last_name text, team_id uuid, team_name text,
              has_account boolean, has_push boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_all boolean;
begin
  v_all := coalesce(public.is_admin(), false) or coalesce(public.is_league_manager(), false);
  if not (v_all or coalesce(public.is_coach(), false)) then raise exception 'not authorized'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.team_id, t.name as team_name,
           (pr.id is not null) as has_account, coalesce(ps.n, 0) > 0 as has_push
      from public.players p
      left join public.teams t on t.id = p.team_id
      left join lateral (select pr2.id from public.profiles pr2 where pr2.player_id = p.id limit 1) pr on true
      left join lateral (select count(*) as n from public.push_subscriptions s where s.user_id = pr.id) ps on true
     where v_all or public.is_coach_of_player(p.id)
     order by (pr.id is not null), (coalesce(ps.n, 0) > 0), t.name nulls last, p.last_name, p.first_name;
end;
$function$;
