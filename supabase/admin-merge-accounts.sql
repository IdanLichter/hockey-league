-- admin_merge_accounts (2026-09-26)
--
-- One person, two accounts — typically Apple in the iPhone app + Google on the web
-- (the web had no Apple sign-in), or a typo'd second email sign-up. This folds
-- p_drop INTO p_keep and deletes p_drop:
--
--   * every Google / Apple sign-in (auth.identities) moves to p_keep, so those roads
--     lead to one account from now on. p_drop's email+password login (if any) is
--     lost with it and reported as lost_email_login;
--   * the player card moves if only p_drop had one (refuses if BOTH have cards —
--     that is two different people, or needs a human);
--   * every row in public.* that references p_drop through a foreign key to
--     auth.users / public.profiles is repointed at p_keep. Found from the catalog,
--     so tables added later are covered. A row that would collide with p_keep's own
--     (unique likes, wallets, …) is dropped — p_keep's copy wins;
--   * p_drop's display name / avatar fill p_keep's only where p_keep has none.
--
-- Keep the account the APP uses: its session and push registration survive, so
-- the player is never signed out. Recipe it automates: memory
-- hockey-app-users-and-dup-accounts (Ori Raizler, merged by hand).

create or replace function public.admin_merge_accounts(p_keep uuid, p_drop uuid)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_keep_player uuid;
  v_drop_player uuid;
  v_fk record;
  v_row record;
  v_moved int;
  v_dropped int;
  v_report jsonb := '{}'::jsonb;
  v_lost_email text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'two different accounts required';
  end if;
  if not exists (select 1 from auth.users where id = p_keep)
     or not exists (select 1 from auth.users where id = p_drop) then
    raise exception 'account not found';
  end if;
  if exists (select 1 from public.admin_users a join auth.users u on lower(u.email) = lower(a.email) where u.id = p_drop) then
    raise exception 'refusing to delete an admin account';
  end if;

  select player_id into v_keep_player from public.profiles where id = p_keep;
  select player_id into v_drop_player from public.profiles where id = p_drop;
  if v_keep_player is not null and v_drop_player is not null and v_keep_player <> v_drop_player then
    raise exception 'both accounts are linked to different player cards';
  end if;

  -- Card first: profiles.player_id is UNIQUE, so free it before re-using it.
  if v_drop_player is not null then
    update public.profiles set player_id = null where id = p_drop;
    update public.profiles set player_id = v_drop_player where id = p_keep;
  end if;

  update public.profiles k
     set display_name = coalesce(nullif(k.display_name, ''), d.display_name),
         avatar_url   = coalesce(k.avatar_url, d.avatar_url)
    from public.profiles d
   where k.id = p_keep and d.id = p_drop;

  -- Every public FK that points at a user (auth.users.id or profiles.id).
  for v_fk in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
       and n.nspname = 'public'
       and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
       and not (c.conrelid = 'public.profiles'::regclass and a.attname = 'id')
  loop
    v_moved := 0; v_dropped := 0;
    begin
      execute format('update %s set %I = $1 where %I = $2', v_fk.tbl, v_fk.col, v_fk.col)
        using p_keep, p_drop;
      get diagnostics v_moved = row_count;
    exception when unique_violation then
      -- Row by row: move what fits, drop what collides with p_keep's own row.
      for v_row in execute format('select ctid from %s where %I = $1', v_fk.tbl, v_fk.col) using p_drop loop
        begin
          execute format('update %s set %I = $1 where ctid = $2', v_fk.tbl, v_fk.col) using p_keep, v_row.ctid;
          v_moved := v_moved + 1;
        exception when unique_violation then
          execute format('delete from %s where ctid = $1', v_fk.tbl) using v_row.ctid;
          v_dropped := v_dropped + 1;
        end;
      end loop;
    end;
    if v_moved + v_dropped > 0 then
      v_report := v_report || jsonb_build_object(format('%s.%s', v_fk.tbl, v_fk.col),
                                                 jsonb_build_object('moved', v_moved, 'dropped', v_dropped));
    end if;
  end loop;

  -- Sign-in methods. OAuth identities (Google / Apple) move over. An email+password
  -- login can NOT move: the email and password live on p_drop's auth.users row, so
  -- that login ends with p_drop — reported back so the admin can tell the person.
  update auth.identities set user_id = p_keep where user_id = p_drop and provider not in ('email', 'phone');
  select case when exists (select 1 from auth.identities where user_id = p_drop and provider = 'email')
              then (select email from auth.users where id = p_drop) end
    into v_lost_email;
  update auth.users u
     set raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('providers',
           (select coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb) from auth.identities i where i.user_id = p_keep))
   where u.id = p_keep;

  delete from auth.users where id = p_drop;   -- cascades p_drop's profile + sessions

  return jsonb_build_object('kept', p_keep, 'deleted', p_drop,
                            'player_id', coalesce(v_keep_player, v_drop_player), 'rows', v_report,
                            'lost_email_login', v_lost_email);
end;
$$;

revoke all on function public.admin_merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_accounts(uuid, uuid) to authenticated;
