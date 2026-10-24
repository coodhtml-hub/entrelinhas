-- Execute uma vez no SQL Editor do projeto Entrelinhas.
-- Cria automaticamente o perfil no cadastro e configura armazenamento privado de capas.

create or replace function public.handle_new_entrelinhas_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'leitor_' || replace(new.id::text, '-', ''))),
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Leitor Entrelinhas')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_entrelinhas_user() from public;
drop trigger if exists on_entrelinhas_auth_user_created on auth.users;
create trigger on_entrelinhas_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_entrelinhas_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', false, 8388608, array['image/jpeg']::text[])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg']::text[];

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cover owner or mutual friend can read') then
    create policy "cover owner or mutual friend can read" on storage.objects for select to authenticated using (
      bucket_id = 'book-covers' and (
        (storage.foldername(name))[1] = (select auth.uid())::text or exists (
          select 1 from public.follows a join public.follows b
          on b.follower_id = a.followed_id and b.followed_id = a.follower_id
          where a.follower_id = (select auth.uid()) and (storage.foldername(name))[1] = a.followed_id::text
        )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='user uploads own covers') then
    create policy "user uploads own covers" on storage.objects for insert to authenticated with check (
      bucket_id = 'book-covers' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='user updates own covers') then
    create policy "user updates own covers" on storage.objects for update to authenticated using (
      bucket_id = 'book-covers' and (storage.foldername(name))[1] = (select auth.uid())::text
    ) with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='user deletes own covers') then
    create policy "user deletes own covers" on storage.objects for delete to authenticated using (
      bucket_id = 'book-covers' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end $$;
