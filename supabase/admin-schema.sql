-- Admin Users table — stores emails that have admin access
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can check if their email is in the admin list
CREATE POLICY "Auth users check admin status" ON admin_users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete admin_users
CREATE POLICY "Admin write admin_users" ON admin_users
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin update admin_users" ON admin_users
  FOR UPDATE USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin delete admin_users" ON admin_users
  FOR DELETE USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

-- Update existing write policies to require admin auth
-- First drop the old overly-permissive policies
DROP POLICY IF EXISTS "Admin write teams" ON teams;
DROP POLICY IF EXISTS "Admin write players" ON players;
DROP POLICY IF EXISTS "Admin write referees" ON referees;
DROP POLICY IF EXISTS "Admin write games" ON games;
DROP POLICY IF EXISTS "Admin write game_stats" ON game_stats;

-- Create proper admin-only write policies
CREATE POLICY "Admin write teams" ON teams
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  ) WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin write players" ON players
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  ) WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin write referees" ON referees
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  ) WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin write games" ON games
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  ) WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

CREATE POLICY "Admin write game_stats" ON game_stats
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  ) WITH CHECK (
    auth.jwt() ->> 'email' IN (SELECT email FROM admin_users)
  );

-- Seed initial admin users
INSERT INTO admin_users (email, name) VALUES
  ('ilichter22@gmail.com', 'עידן ליכטר'),
  ('idorichter4@gmail.com', 'עידו ריכטר'),
  ('uriellir@gmail.com', 'אורי לירמן')
ON CONFLICT (email) DO NOTHING;
