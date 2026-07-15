-- game-change-requests-down.sql
-- Reverses game-change-requests.sql. Purely additive feature, so the teardown is
-- a clean drop of the triggers, functions, and table. Notifications already
-- written to users' bells are left in place (harmless orphaned history rows).

drop trigger if exists trg_notify_game_change_decision on public.game_change_requests;
drop trigger if exists trg_notify_new_game_change       on public.game_change_requests;

drop function if exists public.notify_on_game_change_decision();
drop function if exists public.notify_managers_new_game_change();
drop function if exists public.cancel_game_change_request(uuid);
drop function if exists public.reject_game_change(uuid,text);
drop function if exists public.approve_game_change(uuid,text);
drop function if exists public.request_game_change(uuid,timestamptz,text,text);

drop table if exists public.game_change_requests;
