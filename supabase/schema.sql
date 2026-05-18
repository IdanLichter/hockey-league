-- Hockey League Database Schema
-- Run this in your Supabase SQL Editor to create all tables

-- Teams table
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#f97316',
  secondary_color TEXT DEFAULT '#ea580c',
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  own_goals_received INTEGER DEFAULT 0,
  founded_year INTEGER,
  home_venue TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  jersey_number INTEGER,
  position TEXT CHECK (position IN ('Field Player', 'Goalkeeper')),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_referee BOOLEAN DEFAULT FALSE,
  is_core BOOLEAN DEFAULT FALSE,
  age INTEGER,
  goals INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  blue_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referees table (external referees only)
CREATE TABLE referees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games table
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  home_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  game_date TIMESTAMPTZ NOT NULL,
  venue TEXT,
  home_score INTEGER,
  away_score INTEGER,
  home_own_goals INTEGER DEFAULT 0,
  away_own_goals INTEGER DEFAULT 0,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'waiting_result', 'in_progress', 'completed', 'postponed', 'cancelled')),
  is_neutral BOOLEAN DEFAULT FALSE,
  is_technical_loss BOOLEAN DEFAULT FALSE,
  game_type TEXT DEFAULT 'ליג��' CHECK (game_type IN ('ליגה', 'פלייאוף', 'Final Four')),
  playoff_round TEXT CHECK (playoff_round IN ('first_round', 'semi_final', 'final')),
  series_game INTEGER,
  referee_id TEXT,
  referee_type TEXT CHECK (referee_type IN ('player', 'external')),
  home_clean_sheet BOOLEAN DEFAULT FALSE,
  away_clean_sheet BOOLEAN DEFAULT FALSE,
  notes TEXT,
  referee_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game Stats table (per-player stats for each game)
CREATE TABLE game_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  goals INTEGER DEFAULT 0,
  blue_cards INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT FALSE,
  is_guest_player BOOLEAN DEFAULT FALSE,
  guest_player_name TEXT,
  guest_player_original_team TEXT,
  guest_player_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (public read for all tables)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read players" ON players FOR SELECT USING (true);
CREATE POLICY "Public read referees" ON referees FOR SELECT USING (true);
CREATE POLICY "Public read games" ON games FOR SELECT USING (true);
CREATE POLICY "Public read game_stats" ON game_stats FOR SELECT USING (true);

-- Admin write policies (using service role or authenticated admin)
CREATE POLICY "Admin write teams" ON teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin write players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin write referees" ON referees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin write games" ON games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin write game_stats" ON game_stats FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_games_home_team ON games(home_team_id);
CREATE INDEX idx_games_away_team ON games(away_team_id);
CREATE INDEX idx_games_date ON games(game_date DESC);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_game_stats_game ON game_stats(game_id);
CREATE INDEX idx_game_stats_player ON game_stats(player_id);
