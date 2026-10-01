-- Referee ↔ game_officials sync — 2026-10-01. Applied to prod via MCP migration
-- `referee_officials_sync`.
--
-- There were two ways to put a judge on a game and they never met:
--   * the game edit form (web משחקים tab, iOS/Android management) writes games.referee_id
--     (a PLAYER id), and
--   * the בעלי תפקיד tab writes game_officials (a USER id, status 'approved').
-- A judge's board/game page only reads game_officials, so a judge picked in the edit
-- form was named on the game page but could not open his own game — and if he had once
-- applied and been rejected, his app said so. Only applied→approved judges "worked".
--
-- Fix: when an admin/league manager sets games.referee_id, mirror it into game_officials
-- as an approved judge (and drop the previous edit-form judge). A judge writing his own
-- referee_id when he opens the board is NOT a manager, so that path stays untouched and
-- can't be used to self-approve. Going the other way, assign_official fills referee_id
-- when the game has none, and remove_official clears it when it named the removed judge.

create or replace function public.sync_referee_to_officials()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new uuid; v_old uuid;
begin
  if not (public.is_admin() or public.is_league_manager()) then return new; end if;
  if tg_op = 'UPDATE' and new.referee_id is not distinct from old.referee_id then return new; end if;

  if new.referee_id is not null and coalesce(new.referee_type, 'player') = 'player' then
    select id into v_new from public.profiles where player_id::text = new.referee_id limit 1;
  end if;
  if tg_op = 'UPDATE' and old.referee_id is not null and coalesce(old.referee_type, 'player') = 'player' then
    select id into v_old from public.profiles where player_id::text = old.referee_id limit 1;
  end if;

  if v_old is not null and v_old is distinct from v_new then
    delete from public.game_officials
     where game_id = new.id and role = 'judge' and user_id = v_old and status in ('assigned', 'approved');
  end if;

  if v_new is not null and not exists (
    select 1 from public.game_officials
     where game_id = new.id and role = 'judge' and user_id = v_new and status in ('assigned', 'approved')
  ) then
    insert into public.game_officials (game_id, user_id, role, status, created_by, reviewed_by, reviewed_at)
      values (new.id, v_new, 'judge', 'approved', auth.uid(), auth.uid(), now())
      on conflict (game_id, role, user_id)
      do update set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now();
    perform public.create_notification(v_new, 'official_assigned', auth.uid(), 'game', new.id::text,
      jsonb_build_object('role', 'judge'));
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_referee_to_officials on public.games;
create trigger trg_sync_referee_to_officials
  after insert or update of referee_id on public.games
  for each row execute function public.sync_referee_to_officials();

create or replace function public.assign_official(p_game_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  if p_role not in ('judge','medic') then raise exception 'bad role'; end if;
  insert into public.game_officials (game_id, user_id, role, status, created_by, reviewed_by, reviewed_at)
    values (p_game_id, p_user_id, p_role, 'approved', auth.uid(), auth.uid(), now())
    on conflict (game_id, role, user_id)
    do update set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now();
  perform public.create_notification(p_user_id, 'official_assigned', auth.uid(), 'game', p_game_id::text,
    jsonb_build_object('role', p_role));
  -- Name him on the game page too, unless the game already names a referee.
  if p_role = 'judge' then
    select player_id into v_player from public.profiles where id = p_user_id;
    if v_player is not null then
      update public.games set referee_id = v_player::text, referee_type = 'player'
       where id = p_game_id and referee_id is null;
    end if;
  end if;
end; $$;

create or replace function public.remove_official(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_user uuid; v_role text; v_player uuid;
begin
  if not (public.is_admin() or public.is_league_manager()) then raise exception 'not authorized'; end if;
  delete from public.game_officials where id = p_id returning game_id, user_id, role into v_game, v_user, v_role;
  if v_role = 'judge' then
    select player_id into v_player from public.profiles where id = v_user;
    if v_player is not null then
      update public.games set referee_id = null, referee_type = null
       where id = v_game and referee_id = v_player::text and coalesce(referee_type, 'player') = 'player';
    end if;
  end if;
end; $$;

-- Backfill: upcoming games whose edit-form judge was never registered (2026-10-01: 4 games).
insert into public.game_officials (game_id, user_id, role, status, created_by, reviewed_by, reviewed_at)
select g.id, pr.id, 'judge', 'approved', null, null, now()
  from public.games g join public.profiles pr on pr.player_id::text = g.referee_id
 where coalesce(g.referee_type, 'player') = 'player' and g.status not in ('completed', 'cancelled')
on conflict (game_id, role, user_id) do update set status = 'approved', reviewed_at = now()
  where public.game_officials.status not in ('assigned', 'approved');
