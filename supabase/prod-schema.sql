-- Live public schema snapshot (introspected), generated <PLACEHOLDER_DATE>. Not a substitute for supabase db pull but reproduces structure.
--
-- Source: live Supabase project, schema "public", read-only introspection of pg_catalog / information_schema.
-- Ordering is replay-safe top-to-bottom: extensions -> tables -> constraints -> indexes -> functions -> triggers -> RLS.
-- Cross-table FKs are all added in the CONSTRAINTS section, after every table exists.
-- Objects in the auth.* schema (e.g. auth.users) are referenced by FKs but are managed by Supabase and not created here.


-- ===== SECTION 1: EXTENSIONS =====

create extension if not exists pg_stat_statements;
create extension if not exists pgcrypto;
create extension if not exists supabase_vault;
create extension if not exists "uuid-ossp";


-- ===== SECTION 2: TABLES =====

create table if not exists public.admin_users (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamp with time zone default now()
);

create table if not exists public.archived_game_stats (
  id uuid not null default gen_random_uuid(),
  season_id uuid,
  archived_game_id uuid,
  player_first_name text,
  player_last_name text,
  team_name text,
  goals integer default 0,
  blue_cards integer default 0,
  red_cards integer default 0,
  clean_sheet boolean default false
);

create table if not exists public.archived_games (
  id uuid not null default gen_random_uuid(),
  season_id uuid,
  original_game_id uuid,
  home_team_name text not null,
  away_team_name text not null,
  home_team_id uuid,
  away_team_id uuid,
  game_date timestamp with time zone,
  venue text,
  home_score integer,
  away_score integer,
  status text,
  game_type text,
  playoff_round text,
  series_game integer
);

create table if not exists public.archived_player_stats (
  id uuid not null default gen_random_uuid(),
  season_id uuid,
  player_id uuid,
  player_first_name text not null,
  player_last_name text not null,
  team_id uuid,
  team_name text,
  "position" text,
  goals integer default 0,
  games_played integer default 0,
  blue_cards integer default 0,
  red_cards integer default 0,
  is_core boolean default false,
  is_referee boolean default false
);

create table if not exists public.archived_seasons (
  id uuid not null default gen_random_uuid(),
  name text not null,
  archived_at timestamp with time zone default now()
);

create table if not exists public.archived_team_standings (
  id uuid not null default gen_random_uuid(),
  season_id uuid,
  team_id uuid,
  team_name text not null,
  wins integer default 0,
  losses integer default 0,
  ties integer default 0,
  points integer default 0,
  goals_for integer default 0,
  goals_against integer default 0,
  own_goals_received integer default 0,
  final_rank integer
);

create table if not exists public.cluster_photos (
  cluster_key text not null,
  photo_id text not null,
  box jsonb,
  face_h integer
);

create table if not exists public.cluster_suggestions (
  id uuid not null default gen_random_uuid(),
  cluster_key text not null,
  first_name text not null,
  last_name text not null,
  suggested_by uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  body text not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.content_reports (
  id uuid not null default gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open'::text,
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

create table if not exists public.direct_messages (
  id uuid not null default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  body text not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.face_clusters (
  cluster_key text not null,
  size integer not null default 0,
  status text not null default 'unresolved'::text,
  player_name text,
  cover_url text,
  sample_urls jsonb not null default '[]'::jsonb,
  source_detail_url text,
  album_idx integer,
  created_at timestamp with time zone not null default now(),
  albums jsonb not null default '[]'::jsonb,
  game_date date,
  player_id uuid
);

create table if not exists public.feed_item_comments (
  id uuid not null default gen_random_uuid(),
  item_key text not null,
  author_id uuid not null,
  body text not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.feed_item_likes (
  item_key text not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.feed_photo_overrides (
  item_key text not null,
  photo_id text,
  set_by uuid,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.game_stats (
  id uuid not null default gen_random_uuid(),
  game_id uuid,
  player_id uuid,
  goals integer default 0,
  blue_cards integer default 0,
  yellow_cards integer default 0,
  red_cards integer default 0,
  clean_sheet boolean default false,
  is_guest_player boolean default false,
  guest_player_name text,
  guest_player_original_team text,
  guest_player_type text,
  created_at timestamp with time zone default now()
);

-- WARNING: the live default for games.game_type is CORRUPTED in the source catalog.
-- It holds bytes: ל(D79C) י(D799) ג(D792) + U+FFFD U+FFFD (two replacement chars, EF BF BD)
-- where the letter ה should be. The intended value is 'ליגה' per games_game_type_check.
-- Reproduced verbatim below to match production exactly; consider fixing with:
--   alter table public.games alter column game_type set default 'ליגה'::text;
create table if not exists public.games (
  id uuid not null default gen_random_uuid(),
  home_team_id uuid,
  away_team_id uuid,
  game_date timestamp with time zone not null,
  venue text,
  home_score integer,
  away_score integer,
  home_own_goals integer default 0,
  away_own_goals integer default 0,
  status text default 'scheduled'::text,
  is_neutral boolean default false,
  is_technical_loss boolean default false,
  game_type text default 'ליג��'::text,
  playoff_round text,
  series_game integer,
  referee_id text,
  referee_type text,
  home_clean_sheet boolean default false,
  away_clean_sheet boolean default false,
  notes text,
  referee_notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.league_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now()
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  actor_id uuid,
  entity_type text,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.photos (
  photo_id text not null,
  album_idx integer,
  album_title text,
  album_date date,
  image_url text not null,
  detail_url text not null,
  n_faces integer not null default 0
);

create table if not exists public.player_claims (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  player_id uuid not null,
  status text not null default 'pending'::text,
  note text,
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

create table if not exists public.players (
  id uuid not null default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  jersey_number integer,
  "position" text,
  team_id uuid,
  is_referee boolean default false,
  is_core boolean default false,
  age integer,
  goals integer default 0,
  games_played integer default 0,
  blue_cards integer default 0,
  red_cards integer default 0,
  photo_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.post_likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.posts (
  id uuid not null default gen_random_uuid(),
  author_id uuid not null,
  body text not null,
  team_id uuid,
  pinned boolean not null default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.profiles (
  id uuid not null,
  display_name text,
  avatar_url text,
  player_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.referees (
  id uuid not null default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.teams (
  id uuid not null default gen_random_uuid(),
  name text not null,
  city text not null,
  logo_url text,
  primary_color text default '#f97316'::text,
  secondary_color text default '#ea580c'::text,
  wins integer default 0,
  losses integer default 0,
  ties integer default 0,
  points integer default 0,
  goals_for integer default 0,
  goals_against integer default 0,
  own_goals_received integer default 0,
  founded_year integer,
  home_venue text,
  created_at timestamp with time zone default now()
);

create table if not exists public.user_blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.user_roles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  team_id uuid,
  created_at timestamp with time zone not null default now()
);


-- ===== SECTION 3: CONSTRAINTS (PK, UNIQUE, FK, CHECK) =====

alter table admin_users add constraint admin_users_email_key UNIQUE (email);
alter table admin_users add constraint admin_users_pkey PRIMARY KEY (id);
alter table archived_game_stats add constraint archived_game_stats_pkey PRIMARY KEY (id);
alter table archived_game_stats add constraint archived_game_stats_archived_game_id_fkey FOREIGN KEY (archived_game_id) REFERENCES archived_games(id) ON DELETE CASCADE;
alter table archived_game_stats add constraint archived_game_stats_season_id_fkey FOREIGN KEY (season_id) REFERENCES archived_seasons(id) ON DELETE CASCADE;
alter table archived_games add constraint archived_games_pkey PRIMARY KEY (id);
alter table archived_games add constraint archived_games_season_id_fkey FOREIGN KEY (season_id) REFERENCES archived_seasons(id) ON DELETE CASCADE;
alter table archived_player_stats add constraint archived_player_stats_pkey PRIMARY KEY (id);
alter table archived_player_stats add constraint archived_player_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
alter table archived_player_stats add constraint archived_player_stats_season_id_fkey FOREIGN KEY (season_id) REFERENCES archived_seasons(id) ON DELETE CASCADE;
alter table archived_seasons add constraint archived_seasons_name_key UNIQUE (name);
alter table archived_seasons add constraint archived_seasons_pkey PRIMARY KEY (id);
alter table archived_team_standings add constraint archived_team_standings_pkey PRIMARY KEY (id);
alter table archived_team_standings add constraint archived_team_standings_season_id_fkey FOREIGN KEY (season_id) REFERENCES archived_seasons(id) ON DELETE CASCADE;
alter table archived_team_standings add constraint archived_team_standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
alter table cluster_photos add constraint cluster_photos_pkey PRIMARY KEY (cluster_key, photo_id);
alter table cluster_photos add constraint cluster_photos_cluster_key_fkey FOREIGN KEY (cluster_key) REFERENCES face_clusters(cluster_key) ON DELETE CASCADE;
alter table cluster_suggestions add constraint cluster_suggestions_pkey PRIMARY KEY (id);
alter table cluster_suggestions add constraint cluster_suggestions_cluster_key_fkey FOREIGN KEY (cluster_key) REFERENCES face_clusters(cluster_key) ON DELETE CASCADE;
alter table cluster_suggestions add constraint cluster_suggestions_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table cluster_suggestions add constraint cluster_suggestions_first_name_check CHECK (((length(btrim(first_name)) >= 1) AND (length(btrim(first_name)) <= 40)));
alter table cluster_suggestions add constraint cluster_suggestions_last_name_check CHECK (((length(btrim(last_name)) >= 1) AND (length(btrim(last_name)) <= 40)));
alter table comments add constraint comments_pkey PRIMARY KEY (id);
alter table comments add constraint comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table comments add constraint comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table comments add constraint comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table content_reports add constraint content_reports_pkey PRIMARY KEY (id);
alter table content_reports add constraint content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table content_reports add constraint content_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table content_reports add constraint content_reports_details_check CHECK (((details IS NULL) OR (char_length(details) <= 500)));
alter table content_reports add constraint content_reports_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 60)));
alter table content_reports add constraint content_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'actioned'::text, 'dismissed'::text])));
alter table content_reports add constraint content_reports_target_type_check CHECK ((target_type = ANY (ARRAY['post'::text, 'comment'::text, 'feed_item_comment'::text])));
alter table direct_messages add constraint direct_messages_pkey PRIMARY KEY (id);
alter table direct_messages add constraint direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table direct_messages add constraint direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table direct_messages add constraint direct_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
alter table direct_messages add constraint direct_messages_check CHECK ((sender_id <> recipient_id));
alter table face_clusters add constraint face_clusters_pkey PRIMARY KEY (cluster_key);
alter table face_clusters add constraint face_clusters_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id);
alter table face_clusters add constraint face_clusters_status_check CHECK ((status = ANY (ARRAY['unresolved'::text, 'resolved'::text, 'hidden'::text])));
alter table feed_item_comments add constraint feed_item_comments_pkey PRIMARY KEY (id);
alter table feed_item_comments add constraint feed_item_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table feed_item_comments add constraint feed_item_comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table feed_item_likes add constraint feed_item_likes_pkey PRIMARY KEY (item_key, user_id);
alter table feed_item_likes add constraint feed_item_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table feed_photo_overrides add constraint feed_photo_overrides_pkey PRIMARY KEY (item_key);
alter table feed_photo_overrides add constraint feed_photo_overrides_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES photos(photo_id) ON DELETE CASCADE;
alter table game_stats add constraint game_stats_pkey PRIMARY KEY (id);
alter table game_stats add constraint game_stats_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
alter table game_stats add constraint game_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table games add constraint games_pkey PRIMARY KEY (id);
alter table games add constraint games_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE CASCADE;
alter table games add constraint games_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE CASCADE;
alter table games add constraint games_game_type_check CHECK ((game_type = ANY (ARRAY['ליגה'::text, 'פלייאוף'::text, 'Final Four'::text, 'ידידותי'::text])));
alter table games add constraint games_playoff_round_check CHECK ((playoff_round = ANY (ARRAY['first_round'::text, 'semi_final'::text, 'third_place'::text, 'final'::text])));
alter table games add constraint games_referee_type_check CHECK ((referee_type = ANY (ARRAY['player'::text, 'external'::text])));
alter table games add constraint games_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'waiting_result'::text, 'in_progress'::text, 'completed'::text, 'postponed'::text, 'cancelled'::text])));
alter table league_settings add constraint league_settings_pkey PRIMARY KEY (key);
alter table notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table notifications add constraint notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table photos add constraint photos_pkey PRIMARY KEY (photo_id);
alter table player_claims add constraint player_claims_pkey PRIMARY KEY (id);
alter table player_claims add constraint player_claims_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
alter table player_claims add constraint player_claims_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table player_claims add constraint player_claims_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table player_claims add constraint player_claims_note_check CHECK (((note IS NULL) OR (char_length(note) <= 500)));
alter table player_claims add constraint player_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table players add constraint players_pkey PRIMARY KEY (id);
alter table players add constraint players_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
alter table players add constraint players_position_check CHECK (("position" = ANY (ARRAY['Field Player'::text, 'Goalkeeper'::text])));
alter table post_likes add constraint post_likes_pkey PRIMARY KEY (post_id, user_id);
alter table post_likes add constraint post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table post_likes add constraint post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table posts add constraint posts_pkey PRIMARY KEY (id);
alter table posts add constraint posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table posts add constraint posts_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
alter table posts add constraint posts_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
alter table profiles add constraint profiles_player_id_key UNIQUE (player_id);
alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table profiles add constraint profiles_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
alter table referees add constraint referees_pkey PRIMARY KEY (id);
alter table teams add constraint teams_pkey PRIMARY KEY (id);
alter table user_blocks add constraint user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);
alter table user_blocks add constraint user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table user_blocks add constraint user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table user_blocks add constraint no_self_block CHECK ((blocker_id <> blocked_id));
alter table user_roles add constraint user_roles_user_id_role_team_id_key UNIQUE (user_id, role, team_id);
alter table user_roles add constraint user_roles_pkey PRIMARY KEY (id);
alter table user_roles add constraint user_roles_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
alter table user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table user_roles add constraint user_roles_role_check CHECK ((role = ANY (ARRAY['player'::text, 'coach'::text, 'content_editor'::text, 'judge'::text])));


-- ===== SECTION 4: INDEXES (excluding constraint-backed indexes) =====

CREATE INDEX idx_archived_game_stats_season ON public.archived_game_stats USING btree (season_id);
CREATE INDEX idx_archived_games_season ON public.archived_games USING btree (season_id);
CREATE INDEX idx_archived_player_stats_season ON public.archived_player_stats USING btree (season_id);
CREATE INDEX idx_archived_team_standings_season ON public.archived_team_standings USING btree (season_id);
CREATE INDEX idx_cluster_photos_photo ON public.cluster_photos USING btree (photo_id);
CREATE INDEX idx_cluster_suggestions_key ON public.cluster_suggestions USING btree (cluster_key);
CREATE INDEX comments_post_idx ON public.comments USING btree (post_id, created_at);
CREATE INDEX content_reports_status_idx ON public.content_reports USING btree (status, created_at DESC);
CREATE INDEX content_reports_target_idx ON public.content_reports USING btree (target_type, target_id);
CREATE UNIQUE INDEX content_reports_unique_open ON public.content_reports USING btree (reporter_id, target_type, target_id) WHERE (status = 'open'::text);
CREATE INDEX dm_recipient_idx ON public.direct_messages USING btree (recipient_id, created_at DESC);
CREATE INDEX dm_recipient_unread_idx ON public.direct_messages USING btree (recipient_id) WHERE (read_at IS NULL);
CREATE INDEX dm_sender_idx ON public.direct_messages USING btree (sender_id, created_at DESC);
CREATE INDEX feed_item_comments_item_key_idx ON public.feed_item_comments USING btree (item_key) WHERE (deleted_at IS NULL);
CREATE INDEX feed_item_likes_item_key_idx ON public.feed_item_likes USING btree (item_key);
CREATE INDEX idx_game_stats_game ON public.game_stats USING btree (game_id);
CREATE INDEX idx_game_stats_player ON public.game_stats USING btree (player_id);
CREATE INDEX idx_games_away_team ON public.games USING btree (away_team_id);
CREATE INDEX idx_games_date ON public.games USING btree (game_date DESC);
CREATE INDEX idx_games_home_team ON public.games USING btree (home_team_id);
CREATE INDEX idx_games_status ON public.games USING btree (status);
CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX player_claims_one_pending_per_user ON public.player_claims USING btree (profile_id) WHERE (status = 'pending'::text);
CREATE INDEX player_claims_player_id_idx ON public.player_claims USING btree (player_id);
CREATE INDEX player_claims_status_idx ON public.player_claims USING btree (status);
CREATE INDEX idx_players_team_id ON public.players USING btree (team_id);
CREATE INDEX post_likes_post_idx ON public.post_likes USING btree (post_id);
CREATE INDEX posts_author_id_idx ON public.posts USING btree (author_id);
CREATE INDEX posts_created_at_idx ON public.posts USING btree (created_at DESC);
CREATE INDEX posts_team_id_idx ON public.posts USING btree (team_id);
CREATE INDEX user_roles_team_id_idx ON public.user_roles USING btree (team_id);
CREATE INDEX user_roles_user_id_idx ON public.user_roles USING btree (user_id);


-- ===== SECTION 5: FUNCTIONS =====

CREATE OR REPLACE FUNCTION public.approve_claim(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile uuid;
  v_player  uuid;
  v_team    uuid;
begin
  select profile_id, player_id into v_profile, v_player
    from public.player_claims where id = p_claim_id;
  if v_profile is null then
    raise exception 'claim not found';
  end if;

  select team_id into v_team from public.players where id = v_player;

  if not (public.is_admin() or public.is_coach_of(v_team)) then
    raise exception 'not authorized';
  end if;

  -- profiles.player_id is UNIQUE: raises 23505 if that player is already claimed.
  update public.profiles set player_id = v_player where id = v_profile;

  insert into public.user_roles (user_id, role, team_id)
    values (v_profile, 'player', v_team)
    on conflict (user_id, role, team_id) do nothing;

  update public.player_claims
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_actor_id uuid, p_entity_type text, p_entity_id text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  values (p_user_id, p_type, p_actor_id, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb));
exception when others then
  return;
end; $function$
;

CREATE OR REPLACE FUNCTION public.disconnect_my_pairing()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.profiles set player_id = null where id = uid;
  delete from public.user_roles where user_id = uid and role = 'player';
  delete from public.player_claims where profile_id = uid and status = 'approved';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_dm_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c int;
begin
  select count(*) into c from public.direct_messages
   where sender_id = NEW.sender_id and created_at > now() - interval '1 minute';
  if c >= 20 then
    raise exception 'dm_rate_limit';
  end if;
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare recent int;
begin
  if public.is_admin() or exists (select 1 from public.user_roles where user_id = new.author_id) then
    return new;
  end if;
  select count(*) into recent from public.posts
    where author_id = new.author_id and deleted_at is null
      and created_at > now() - interval '24 hours';
  if recent >= 1 then
    raise exception 'post_rate_limit' using hint = 'regular users may post once per day';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_player_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.player_id is distinct from old.player_id
     and not public.is_admin()
     and not (new.player_id is null and old.id = auth.uid())
     and not (
       new.player_id is not null
       and public.is_coach_of((select team_id from public.players where id = new.player_id))
     ) then
    raise exception 'player_id can only be changed by an admin';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (auth.jwt() ->> 'email') in (select email from public.admin_users)
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach_of(team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select team is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'coach'
      and ur.team_id = team
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_judge()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'judge'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_member(u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admin_users a join auth.users au on au.email = a.email where au.id = u)
      or exists (select 1 from public.user_roles r where r.user_id = u)
      or exists (select 1 from public.profiles p where p.id = u and p.player_id is not null);
$function$
;

CREATE OR REPLACE FUNCTION public.judge_save_game_result(p_game_id uuid, p_home_score integer, p_away_score integer, p_stats jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g public.games;
begin
  if not (public.is_admin() or public.is_judge()) then
    raise exception 'not authorized to score games';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found';
  end if;
  if g.status = 'completed' then
    raise exception 'game already completed';
  end if;

  delete from public.game_stats where game_id = p_game_id;

  insert into public.game_stats (game_id, player_id, goals, blue_cards, red_cards, clean_sheet)
  select p_game_id,
         (r->>'player_id')::uuid,
         coalesce((r->>'goals')::int, 0),
         coalesce((r->>'blue_cards')::int, 0),
         coalesce((r->>'red_cards')::int, 0),
         coalesce((r->>'clean_sheet')::boolean, false)
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) r
  where (r->>'player_id') is not null;

  update public.games
    set home_score = p_home_score,
        away_score = p_away_score,
        status     = 'completed'
    where id = p_game_id;

  perform public.recompute_team_standings(g.home_team_id);
  perform public.recompute_team_standings(g.away_team_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.messageable_members()
 RETURNS TABLE(id uuid, display_name text, avatar_url text, player_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.display_name, p.avatar_url, p.player_id
  from public.profiles p
  where public.is_member(p.id)
  order by p.display_name nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_admins_new_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pname text; v_cname text;
begin
  select coalesce(first_name, '') || ' ' || coalesce(last_name, '') into v_pname from public.players where id = NEW.player_id;
  select display_name into v_cname from public.profiles where id = NEW.profile_id;
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select au.id, 'claim_request', NEW.profile_id, 'claim', NEW.id::text,
         jsonb_build_object('player_name', trim(coalesce(v_pname, '')), 'claimant', coalesce(v_cname, ''))
  from public.admin_users a join auth.users au on au.email = a.email
  where au.id <> NEW.profile_id;
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_admins_new_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
  select au.id, 'content_report', NEW.reporter_id, NEW.target_type, NEW.target_id::text,
         jsonb_build_object('reason', coalesce(NEW.reason, ''))
  from public.admin_users a join auth.users au on au.email = a.email
  where au.id <> NEW.reporter_id;
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_claim_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pname text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved', 'rejected') then
    select coalesce(first_name, '') || ' ' || coalesce(last_name, '') into v_pname from public.players where id = NEW.player_id;
    perform public.create_notification(
      NEW.profile_id,
      case when NEW.status = 'approved' then 'claim_approved' else 'claim_rejected' end,
      NEW.reviewed_by, 'player', NEW.player_id::text,
      jsonb_build_object('player_name', trim(coalesce(v_pname, ''))));
  end if;
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = NEW.post_id and deleted_at is null;
  perform public.create_notification(
    v_author, 'post_comment', NEW.author_id, 'post', NEW.post_id::text,
    jsonb_build_object('preview', left(coalesce(NEW.body, ''), 80)));
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_game_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_home text; v_away text;
begin
  if NEW.status = 'completed' and OLD.status is distinct from NEW.status then
    select name into v_home from public.teams where id = NEW.home_team_id;
    select name into v_away from public.teams where id = NEW.away_team_id;
    insert into public.notifications(user_id, type, actor_id, entity_type, entity_id, data)
    select distinct pr.id, 'game_result', null, 'game', NEW.id::text,
           jsonb_build_object('home_team', coalesce(v_home, ''), 'away_team', coalesce(v_away, ''),
                              'home_score', NEW.home_score, 'away_score', NEW.away_score)
    from public.game_stats gs
    join public.profiles pr on pr.player_id = gs.player_id
    where gs.game_id = NEW.id;
  end if;
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_author uuid; v_body text;
begin
  select author_id, body into v_author, v_body from public.posts where id = NEW.post_id and deleted_at is null;
  perform public.create_notification(
    v_author, 'post_like', NEW.user_id, 'post', NEW.post_id::text,
    jsonb_build_object('preview', left(coalesce(v_body, ''), 80)));
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_role_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.create_notification(
    NEW.user_id, 'role_granted', null, 'role', NEW.role,
    jsonb_build_object('role', NEW.role, 'team_id', NEW.team_id));
  return null;
exception when others then return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.player_has_game_stats(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.game_stats where player_id = p)
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_all_team_standings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t uuid;
begin
  if not (public.is_admin() or public.is_judge()) then
    raise exception 'not authorized';
  end if;
  for t in select id from public.teams loop
    perform public.recompute_team_standings(t);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_team_standings(p_team uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.teams t set
    wins          = s.wins,
    losses        = s.losses,
    ties          = s.ties,
    points        = s.wins * 3 + s.ties,
    goals_for     = s.gf,
    goals_against = s.ga
  from (
    select
      count(*) filter (where (g.home_team_id = p_team and g.home_score > g.away_score)
                          or (g.away_team_id = p_team and g.away_score > g.home_score)) as wins,
      count(*) filter (where (g.home_team_id = p_team and g.home_score < g.away_score)
                          or (g.away_team_id = p_team and g.away_score < g.home_score)) as losses,
      count(*) filter (where g.home_score = g.away_score)                               as ties,
      coalesce(sum(case when g.home_team_id = p_team then g.home_score else g.away_score end), 0) as gf,
      coalesce(sum(case when g.home_team_id = p_team then g.away_score else g.home_score end), 0) as ga
    from public.games g
    where g.status = 'completed'
      and g.game_type <> 'ידידותי'
      and g.home_score is not null and g.away_score is not null
      and (g.home_team_id = p_team or g.away_team_id = p_team)
  ) s
  where t.id = p_team;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_claim(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_team uuid;
begin
  select pl.team_id into v_team
    from public.player_claims c join public.players pl on pl.id = c.player_id
   where c.id = p_claim_id;
  if v_team is null then
    raise exception 'claim not found';
  end if;

  if not (public.is_admin() or public.is_coach_of(v_team)) then
    raise exception 'not authorized';
  end if;

  update public.player_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;


-- ===== SECTION 6: TRIGGERS =====

CREATE TRIGGER trg_notify_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION notify_on_comment();
CREATE TRIGGER trg_notify_new_report AFTER INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION notify_admins_new_report();
CREATE TRIGGER trg_dm_rate_limit BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION enforce_dm_rate_limit();
CREATE TRIGGER trg_notify_game_completed AFTER UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION notify_on_game_completed();
CREATE TRIGGER trg_notify_claim_review AFTER UPDATE ON public.player_claims FOR EACH ROW EXECUTE FUNCTION notify_on_claim_review();
CREATE TRIGGER trg_notify_new_claim AFTER INSERT ON public.player_claims FOR EACH ROW EXECUTE FUNCTION notify_admins_new_claim();
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION notify_on_post_like();
CREATE TRIGGER posts_rate_limit BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION enforce_post_rate_limit();
CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_guard_player_id BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_player_id();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_role_grant AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION notify_on_role_grant();

-- NOTE: the auth.users -> public.handle_new_user() trigger lives in the auth schema (owned by Supabase)
-- and is therefore not part of this public-schema snapshot. Recreate it separately if rebuilding from scratch:
--   create trigger on_auth_user_created after insert on auth.users
--     for each row execute function public.handle_new_user();


-- ===== SECTION 7: ROW LEVEL SECURITY =====

-- Enable RLS
alter table public.admin_users enable row level security;
alter table public.archived_game_stats enable row level security;
alter table public.archived_games enable row level security;
alter table public.archived_player_stats enable row level security;
alter table public.archived_seasons enable row level security;
alter table public.archived_team_standings enable row level security;
alter table public.cluster_photos enable row level security;
alter table public.cluster_suggestions enable row level security;
alter table public.comments enable row level security;
alter table public.content_reports enable row level security;
alter table public.direct_messages enable row level security;
alter table public.face_clusters enable row level security;
alter table public.feed_item_comments enable row level security;
alter table public.feed_item_likes enable row level security;
alter table public.feed_photo_overrides enable row level security;
alter table public.game_stats enable row level security;
alter table public.games enable row level security;
alter table public.league_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.photos enable row level security;
alter table public.player_claims enable row level security;
alter table public.players enable row level security;
alter table public.post_likes enable row level security;
alter table public.posts enable row level security;
alter table public.profiles enable row level security;
alter table public.referees enable row level security;
alter table public.teams enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_roles enable row level security;

-- Policies
create policy "Admin delete admin_users" on public.admin_users as permissive for delete to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users_1.email
   FROM admin_users admin_users_1)));
create policy "Admin insert admin_users" on public.admin_users as permissive for insert to public
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users_1.email
   FROM admin_users admin_users_1)));
create policy "Admin update admin_users" on public.admin_users as permissive for update to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users_1.email
   FROM admin_users admin_users_1)));
create policy "Auth users check admin status" on public.admin_users as permissive for select to public
  using ((auth.role() = 'authenticated'::text));
create policy "Admin write archived_game_stats" on public.archived_game_stats as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read archived_game_stats" on public.archived_game_stats as permissive for select to public
  using (true);
create policy "Admin write archived_games" on public.archived_games as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read archived_games" on public.archived_games as permissive for select to public
  using (true);
create policy "Admin write archived_player_stats" on public.archived_player_stats as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read archived_player_stats" on public.archived_player_stats as permissive for select to public
  using (true);
create policy "Admin write archived_seasons" on public.archived_seasons as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read archived_seasons" on public.archived_seasons as permissive for select to public
  using (true);
create policy "Admin write archived_team_standings" on public.archived_team_standings as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read archived_team_standings" on public.archived_team_standings as permissive for select to public
  using (true);
create policy "Admin manage cluster_photos" on public.cluster_photos as permissive for all to public
  using (is_admin())
  with check (is_admin());
create policy "Public read cluster_photos" on public.cluster_photos as permissive for select to public
  using (true);
create policy "Admin delete suggestions" on public.cluster_suggestions as permissive for delete to public
  using (is_admin());
create policy "Anyone can suggest" on public.cluster_suggestions as permissive for insert to public
  with check (((suggested_by IS NULL) OR (suggested_by = auth.uid())));
create policy "Public read suggestions" on public.cluster_suggestions as permissive for select to public
  using (true);
create policy "Authenticated comment as self" on public.comments as permissive for insert to authenticated
  with check ((author_id = auth.uid()));
create policy "Author or admin delete comment" on public.comments as permissive for delete to public
  using (((author_id = auth.uid()) OR is_admin()));
create policy "Author or admin update comment" on public.comments as permissive for update to public
  using (((author_id = auth.uid()) OR is_admin()))
  with check (((author_id = auth.uid()) OR is_admin()));
create policy "Public read comments" on public.comments as permissive for select to public
  using (((deleted_at IS NULL) OR is_admin()));
create policy "report admin update" on public.content_reports as permissive for update to authenticated
  using (is_admin())
  with check (is_admin());
create policy "report insert as self" on public.content_reports as permissive for insert to authenticated
  with check ((reporter_id = auth.uid()));
create policy "report read own or admin" on public.content_reports as permissive for select to authenticated
  using (((reporter_id = auth.uid()) OR is_admin()));
create policy "read own dms" on public.direct_messages as permissive for select to authenticated
  using (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));
create policy "send dms" on public.direct_messages as permissive for insert to authenticated
  with check (((sender_id = auth.uid()) AND is_member(auth.uid()) AND is_member(recipient_id)));
create policy "update own dms" on public.direct_messages as permissive for update to authenticated
  using (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)))
  with check (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));
create policy "Admin manage clusters" on public.face_clusters as permissive for all to public
  using (is_admin())
  with check (is_admin());
create policy "Public read clusters" on public.face_clusters as permissive for select to public
  using (((status <> 'hidden'::text) OR is_admin()));
create policy "Authenticated item comment as self" on public.feed_item_comments as permissive for insert to authenticated
  with check ((author_id = auth.uid()));
create policy "Author or admin delete item comment" on public.feed_item_comments as permissive for delete to public
  using (((author_id = auth.uid()) OR is_admin()));
create policy "Author or admin update item comment" on public.feed_item_comments as permissive for update to public
  using (((author_id = auth.uid()) OR is_admin()))
  with check (((author_id = auth.uid()) OR is_admin()));
create policy "Public read feed_item_comments" on public.feed_item_comments as permissive for select to public
  using (((deleted_at IS NULL) OR is_admin()));
create policy "Authenticated like item as self" on public.feed_item_likes as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "Authenticated unlike own item" on public.feed_item_likes as permissive for delete to authenticated
  using ((user_id = auth.uid()));
create policy "Public read feed_item_likes" on public.feed_item_likes as permissive for select to public
  using (true);
create policy "Admin write feed_photo_overrides" on public.feed_photo_overrides as permissive for all to public
  using (is_admin())
  with check (is_admin());
create policy "Public read feed_photo_overrides" on public.feed_photo_overrides as permissive for select to public
  using (true);
create policy "Admin write game_stats" on public.game_stats as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Judge delete game_stats" on public.game_stats as permissive for delete to public
  using (is_judge());
create policy "Judge insert game_stats" on public.game_stats as permissive for insert to public
  with check (is_judge());
create policy "Judge update game_stats" on public.game_stats as permissive for update to public
  using (is_judge())
  with check (is_judge());
create policy "Public read game_stats" on public.game_stats as permissive for select to public
  using (true);
create policy "Admin write games" on public.games as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Judge delete games" on public.games as permissive for delete to public
  using (is_judge());
create policy "Judge insert games" on public.games as permissive for insert to public
  with check (is_judge());
create policy "Judge update games" on public.games as permissive for update to public
  using (is_judge())
  with check (is_judge());
create policy "Public read games" on public.games as permissive for select to public
  using (true);
create policy "Admin insert settings" on public.league_settings as permissive for insert to public
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Admin update settings" on public.league_settings as permissive for update to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read settings" on public.league_settings as permissive for select to public
  using (true);
create policy "delete own notifications" on public.notifications as permissive for delete to authenticated
  using ((user_id = auth.uid()));
create policy "read own notifications" on public.notifications as permissive for select to authenticated
  using ((user_id = auth.uid()));
create policy "update own notifications" on public.notifications as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "Admin manage photos" on public.photos as permissive for all to public
  using (is_admin())
  with check (is_admin());
create policy "Public read photos" on public.photos as permissive for select to public
  using (true);
create policy "Admin updates claims" on public.player_claims as permissive for update to public
  using (is_admin())
  with check (is_admin());
create policy "Coach reads own-team claims" on public.player_claims as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM players pl
  WHERE ((pl.id = player_claims.player_id) AND is_coach_of(pl.team_id)))));
create policy "Read own claims or admin" on public.player_claims as permissive for select to public
  using (((profile_id = auth.uid()) OR is_admin()));
create policy "User cancels own pending claim" on public.player_claims as permissive for delete to public
  using ((((profile_id = auth.uid()) AND (status = 'pending'::text)) OR is_admin()));
create policy "User inserts own pending claim" on public.player_claims as permissive for insert to public
  with check (((profile_id = auth.uid()) AND (status = 'pending'::text)));
create policy "Admin write players" on public.players as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Coach delete own-team players" on public.players as permissive for delete to public
  using ((is_coach_of(team_id) AND (NOT player_has_game_stats(id))));
create policy "Coach insert own-team players" on public.players as permissive for insert to public
  with check (is_coach_of(team_id));
create policy "Coach update own-team players" on public.players as permissive for update to public
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));
create policy "Public read players" on public.players as permissive for select to public
  using (true);
create policy "Authenticated like as self" on public.post_likes as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "Authenticated unlike own" on public.post_likes as permissive for delete to authenticated
  using ((user_id = auth.uid()));
create policy "Public read post_likes" on public.post_likes as permissive for select to public
  using (true);
create policy "Authenticated insert own posts" on public.posts as permissive for insert to authenticated
  with check ((author_id = auth.uid()));
create policy "Author or admin delete" on public.posts as permissive for delete to public
  using (((author_id = auth.uid()) OR is_admin()));
create policy "Author or admin update" on public.posts as permissive for update to public
  using (((author_id = auth.uid()) OR is_admin()))
  with check (((author_id = auth.uid()) OR is_admin()));
create policy "Public read posts" on public.posts as permissive for select to public
  using (((deleted_at IS NULL) OR is_admin()));
create policy "Public read profiles" on public.profiles as permissive for select to public
  using (true);
create policy "User insert own profile" on public.profiles as permissive for insert to public
  with check ((id = auth.uid()));
create policy "User or admin update profile" on public.profiles as permissive for update to public
  using (((id = auth.uid()) OR is_admin()))
  with check (((id = auth.uid()) OR is_admin()));
create policy "Admin write referees" on public.referees as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read referees" on public.referees as permissive for select to public
  using (true);
create policy "Admin write teams" on public.teams as permissive for all to public
  using (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)))
  with check (((auth.jwt() ->> 'email'::text) IN ( SELECT admin_users.email
   FROM admin_users)));
create policy "Public read teams" on public.teams as permissive for select to public
  using (true);
create policy "blocks manage own" on public.user_blocks as permissive for all to authenticated
  using ((blocker_id = auth.uid()))
  with check ((blocker_id = auth.uid()));
create policy "Admin manages roles" on public.user_roles as permissive for all to public
  using (is_admin())
  with check (is_admin());
create policy "Read own roles or admin" on public.user_roles as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));


-- ===== END OF SNAPSHOT =====
