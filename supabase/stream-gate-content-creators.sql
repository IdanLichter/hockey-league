-- Narrow video streaming to content creators (content_editor) + admin.
--
-- can_stream_game() is the SINGLE gate used by BOTH the game_videos RLS write
-- policy and the stream-golive edge fn, so this one change restricts the live
-- camera, YouTube-link attach, and detach together. Previously it also allowed
-- judges and team coaches. Admin is kept as the superuser (so the owner can't
-- lock themselves out). p_game_id stays in the signature (RLS + edge fn pass it)
-- even though the check is now game-independent.
create or replace function public.can_stream_game(p_game_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(public.is_content_editor() or public.is_admin(), false);
$$;
