-- League Settings table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS league_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE league_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Public read settings" ON league_settings
  FOR SELECT USING (true);

-- Only admins can update settings
CREATE POLICY "Admin insert settings" ON league_settings
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin update settings" ON league_settings
  FOR UPDATE USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

-- Seed default setting
INSERT INTO league_settings (key, value) VALUES
  ('season_mode', 'final_four')
ON CONFLICT (key) DO NOTHING;
