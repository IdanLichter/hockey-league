-- game-form-results-down.sql — reverts game-form-results.sql (results already applied stay).
drop function if exists public.apply_game_form_result(uuid,int,int,int,int,jsonb,uuid,boolean);
drop function if exists public.create_game_form_submission(uuid, text[]);
drop table if exists public.game_form_submissions;
drop policy if exists "game-forms upload officials" on storage.objects;
drop policy if exists "game-forms read officials" on storage.objects;
drop function if exists public.can_enter_game_result();
-- the bucket (and its photos) is left in place on purpose; delete it by hand if wanted.
