-- coach-team-edit.sql
-- Lets a team's coach (or an admin) edit the team's DESCRIPTIVE fields.
-- `teams` RLS is admin-write-only and RLS cannot restrict columns, so editing
-- goes through this SECURITY DEFINER RPC, which whitelists non-competitive
-- columns only. Competitive stats (wins/losses/ties/points/goals_*,
-- own_goals_received) and age_group/status/created_by stay admin-only.
-- The crest (logo_url) is written separately by set_team_logo() in
-- team-logos-storage.sql.

create or replace function public.update_team_details(
  p_team_id         uuid,
  p_name            text,
  p_city            text,
  p_home_venue      text,
  p_primary_color   text,
  p_secondary_color text,
  p_founded_year    integer
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_coach_of(p_team_id)) then
    raise exception 'not authorized';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  if p_founded_year is not null
     and (p_founded_year < 1900 or p_founded_year > extract(year from now())::int) then
    raise exception 'invalid founded year';
  end if;

  update public.teams set
    name            = btrim(p_name),
    city            = nullif(btrim(coalesce(p_city, '')), ''),
    home_venue      = nullif(btrim(coalesce(p_home_venue, '')), ''),
    -- colors: keep the current value if the caller passes blank
    primary_color   = coalesce(nullif(btrim(coalesce(p_primary_color, '')),   ''), primary_color),
    secondary_color = coalesce(nullif(btrim(coalesce(p_secondary_color, '')), ''), secondary_color),
    founded_year    = p_founded_year
  where id = p_team_id;
end;
$$;
revoke all on function public.update_team_details(uuid,text,text,text,text,text,integer) from public, anon;
grant execute on function public.update_team_details(uuid,text,text,text,text,text,integer) to authenticated;
