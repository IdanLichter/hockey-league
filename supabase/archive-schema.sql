-- Archive tables for season history
-- Run this in Supabase SQL Editor

-- Archived seasons metadata
CREATE TABLE IF NOT EXISTS archived_seasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- e.g. "2024-25"
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archived team standings (snapshot at end of season)
CREATE TABLE IF NOT EXISTS archived_team_standings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES archived_seasons(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  team_name TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  own_goals_received INTEGER DEFAULT 0,
  final_rank INTEGER
);

-- Archived player stats (per-season totals)
CREATE TABLE IF NOT EXISTS archived_player_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES archived_seasons(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  player_first_name TEXT NOT NULL,
  player_last_name TEXT NOT NULL,
  team_id UUID,
  team_name TEXT,
  position TEXT,
  goals INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  blue_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  is_core BOOLEAN DEFAULT FALSE,
  is_referee BOOLEAN DEFAULT FALSE
);

-- Archived games
CREATE TABLE IF NOT EXISTS archived_games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES archived_seasons(id) ON DELETE CASCADE,
  original_game_id UUID,
  home_team_name TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  home_team_id UUID,
  away_team_id UUID,
  game_date TIMESTAMPTZ,
  venue TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT,
  game_type TEXT,
  playoff_round TEXT,
  series_game INTEGER
);

-- Archived game stats (per-player per-game)
CREATE TABLE IF NOT EXISTS archived_game_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES archived_seasons(id) ON DELETE CASCADE,
  archived_game_id UUID REFERENCES archived_games(id) ON DELETE CASCADE,
  player_first_name TEXT,
  player_last_name TEXT,
  team_name TEXT,
  goals INTEGER DEFAULT 0,
  blue_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT FALSE
);

-- RLS
ALTER TABLE archived_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_team_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_game_stats ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read archived_seasons" ON archived_seasons FOR SELECT USING (true);
CREATE POLICY "Public read archived_team_standings" ON archived_team_standings FOR SELECT USING (true);
CREATE POLICY "Public read archived_player_stats" ON archived_player_stats FOR SELECT USING (true);
CREATE POLICY "Public read archived_games" ON archived_games FOR SELECT USING (true);
CREATE POLICY "Public read archived_game_stats" ON archived_game_stats FOR SELECT USING (true);

-- Admin write
CREATE POLICY "Admin write archived_seasons" ON archived_seasons
  FOR ALL USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users))
  WITH CHECK (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY "Admin write archived_team_standings" ON archived_team_standings
  FOR ALL USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users))
  WITH CHECK (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY "Admin write archived_player_stats" ON archived_player_stats
  FOR ALL USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users))
  WITH CHECK (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY "Admin write archived_games" ON archived_games
  FOR ALL USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users))
  WITH CHECK (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY "Admin write archived_game_stats" ON archived_game_stats
  FOR ALL USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users))
  WITH CHECK (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

-- Indexes
CREATE INDEX idx_archived_team_standings_season ON archived_team_standings(season_id);
CREATE INDEX idx_archived_player_stats_season ON archived_player_stats(season_id);
CREATE INDEX idx_archived_games_season ON archived_games(season_id);
CREATE INDEX idx_archived_game_stats_season ON archived_game_stats(season_id);
