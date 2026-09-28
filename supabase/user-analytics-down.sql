-- Rollback for user-analytics.sql. Read-only functions; nothing stores data.
drop function if exists public.analytics_errors(int);
drop function if exists public.analytics_versions();
drop function if exists public.analytics_heatmap(int);
drop function if exists public.analytics_retention();
drop function if exists public.analytics_funnel();
drop function if exists public.analytics_features(int);
drop function if exists public.analytics_user_detail(uuid, int);
drop function if exists public.analytics_users(int);
drop function if exists public.analytics_overview(int);
drop function if exists public.analytics_activity(timestamptz);
drop function if exists public.analytics_platform(text);
drop function if exists public.analytics_feature(text);
