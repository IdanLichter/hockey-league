-- squad-manual-add.sql (P0 — 2026-08-02)
-- Applied to production via MCP as migration `squad_manual_add`.
--
-- Schema groundwork for the coach's pre-game squad. Sheet rows 7, 8, 13:
-- הרשמה ידנית של שוער בהשאלה / שחקן נוער חד פעמי / הוספה ידנית של שחקן לטופס.
-- The RPCs and UI that use these columns land in P1; this file only widens the table
-- and fixes the read policy so the new rows are visible to the coach who creates them.
--
-- Reuses game_availability rather than adding a squad table: a manually added player is
-- the same fact as a self-declared one ("this player is coming to this game"), just
-- written by someone else.

alter table public.game_availability
  -- null = the player declared it himself; set = the coach/judge who added him
  add column if not exists added_by uuid references auth.users(id),
  -- Which side he plays for THIS game. Null = derive from his roster, as before.
  -- Required for a loaned goalkeeper or a one-time youth call-up: he is not on the
  -- team's roster, so nothing else in the row says which team he is turning out for.
  add column if not exists team_id uuid references public.teams(id),
  -- free text for the coach, e.g. "שוער בהשאלה מהפועל X"
  add column if not exists note text;

create index if not exists game_availability_added_by_idx
  on public.game_availability(added_by) where added_by is not null;

-- Read policy: everything the previous policy allowed (self / same team / coach of the
-- player's team / admin), plus the loan case.
--
-- The loan case is scoped to game_availability.team_id — NOT to "coach of either team in
-- this game". That wider rule would have let the home coach read the away team's squad,
-- which no coach can see today; keeping it to the side the player was added for closes
-- the hole without leaking the opponent's line-up.
drop policy if exists "read availability self/team/coach/admin" on public.game_availability;
drop policy if exists "read availability self/coach/admin" on public.game_availability;
create policy "read availability self/team/coach/loan/admin" on public.game_availability
  for select using (
    player_id = public.my_player_id()
    or public.is_admin()
    -- coach of the team the player is rostered to
    or exists (
      select 1 from public.players pl
      where pl.id = game_availability.player_id and public.is_coach_of(pl.team_id)
    )
    -- coach of the team he was manually added for (loan / youth call-up)
    or (game_availability.team_id is not null and public.is_coach_of(game_availability.team_id))
    -- teammates see who is coming (C1, availability-same-team-read.sql)
    or exists (
      select 1 from public.players me, public.players them
      where me.id = public.my_player_id()
        and them.id = game_availability.player_id
        and me.team_id is not null
        and me.team_id = them.team_id
    )
  );
