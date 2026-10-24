-- Entrelinhas: foto de perfil privada, limitada à pessoa e aos amigos mútuos.
-- Execute uma única vez no SQL Editor do Supabase depois de publicar os novos arquivos.

alter table public.profiles
  add column if not exists profile_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg']::text[];

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'profile photo owner or mutual friend can read'
  ) then
    create policy "profile photo owner or mutual friend can read"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'profile-photos'
      and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or exists (
          select 1
          from public.follows as outgoing
          join public.follows as incoming
            on incoming.follower_id = outgoing.followed_id
           and incoming.followed_id = outgoing.follower_id
          where outgoing.follower_id = (select auth.uid())
            and outgoing.followed_id::text = (storage.foldername(name))[1]
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'user uploads own profile photo'
  ) then
    create policy "user uploads own profile photo"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'profile-photos'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'user updates own profile photo'
  ) then
    create policy "user updates own profile photo"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'profile-photos'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
      bucket_id = 'profile-photos'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'user deletes own profile photo'
  ) then
    create policy "user deletes own profile photo"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'profile-photos'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end $$;
