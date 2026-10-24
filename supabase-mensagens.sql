-- Entrelinhas: mensagens privadas entre pessoas que se seguem mutuamente.
-- Execute este arquivo no SQL Editor do Supabase depois do schema principal.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists messages_sender_recipient_created_idx
  on public.messages(sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_unread_idx
  on public.messages(recipient_id, created_at desc)
  where read_at is null;

alter table public.messages enable row level security;

-- A conta pode atualizar somente o marcador de leitura de uma mensagem recebida.
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'messages'
      and policyname = 'participants can view messages'
  ) then
    create policy "participants can view messages" on public.messages
      for select to authenticated
      using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'messages'
      and policyname = 'sender can send message to mutual friend'
  ) then
    create policy "sender can send message to mutual friend" on public.messages
      for insert to authenticated
      with check (
        sender_id = (select auth.uid()) and exists (
          select 1 from public.follows a
          join public.follows b on b.follower_id = a.followed_id and b.followed_id = a.follower_id
          where a.follower_id = (select auth.uid()) and a.followed_id = recipient_id
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'messages'
      and policyname = 'recipient can mark message read'
  ) then
    create policy "recipient can mark message read" on public.messages
      for update to authenticated
      using (recipient_id = (select auth.uid()))
      with check (recipient_id = (select auth.uid()));
  end if;
end;
$$;

alter table public.notifications
  add column if not exists message_id uuid references public.messages(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('new_follower', 'new_book', 'message'));

create or replace function public.notify_entrelinhas_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, message_id)
  values (new.recipient_id, new.sender_id, 'message', new.id);
  return new;
end;
$$;

revoke all on function public.notify_entrelinhas_new_message() from public;
drop trigger if exists on_entrelinhas_message_created on public.messages;
create trigger on_entrelinhas_message_created
  after insert on public.messages
  for each row execute function public.notify_entrelinhas_new_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;


