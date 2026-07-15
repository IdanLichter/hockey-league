-- avatars-storage.sql
-- Public Storage bucket for user profile photos. `profiles.avatar_url` stays the
-- source of truth; users UPLOAD a photo here (path "<user_id>/<file>") instead of
-- pasting an image URL. Public-read (rendered as a plain <img src> on the feed,
-- profile, and player cards); a user may write only their OWN <user_id>/ folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
