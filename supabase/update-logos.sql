-- Update team logos
-- Run this in Supabase SQL Editor after deploying to Vercel

UPDATE teams SET logo_url = '/logos/givat-ada-halutzim.png' WHERE id = 'a1b2c3d4-0001-0000-0000-000000000001';
UPDATE teams SET logo_url = '/logos/balag-bogrim.png' WHERE id = 'a1b2c3d4-0002-0000-0000-000000000002';
UPDATE teams SET logo_url = '/logos/givat-ada-noar.png' WHERE id = 'a1b2c3d4-0003-0000-0000-000000000003';
UPDATE teams SET logo_url = '/logos/ramat-yishai.png' WHERE id = 'a1b2c3d4-0004-0000-0000-000000000004';
UPDATE teams SET logo_url = '/logos/kiryat-motzkin.png' WHERE id = 'a1b2c3d4-0005-0000-0000-000000000005';
UPDATE teams SET logo_url = '/logos/kiryat-bialik.png' WHERE id = 'a1b2c3d4-0006-0000-0000-000000000006';
UPDATE teams SET logo_url = '/logos/balag-noar.png' WHERE id = 'a1b2c3d4-0007-0000-0000-000000000007';
