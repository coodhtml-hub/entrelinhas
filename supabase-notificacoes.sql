-- Notificações de novos seguidores e novos livros para o Entrelinhas.
-- Pode ser executado novamente sem duplicar avisos antigos.

-- Guarda a referência do livro para a notificação abrir o item correto.
alter table public.notifications
  add column if not exists book_id uuid references public.books(id) on delete cascade;

-- Permite os dois eventos já implementados; message fica preparado para etapa futura.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('new_follower', 'new_book', 'message'));

create or replace function public.notify_entrelinhas_new_follower()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind)
  values (new.followed_id, new.follower_id, 'new_follower');
  return new;
end;
$$;

revoke all on function public.notify_entrelinhas_new_follower() from public;
drop trigger if exists on_entrelinhas_follow_created on public.follows;
create trigger on_entrelinhas_follow_created
after insert on public.follows
for each row execute function public.notify_entrelinhas_new_follower();

create or replace function public.notify_entrelinhas_mutual_friends_new_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, book_id)
  select actor_follow.followed_id, new.owner_id, 'new_book', new.id
  from public.follows actor_follow
  join public.follows mutual_follow
    on mutual_follow.follower_id = actor_follow.followed_id
   and mutual_follow.followed_id = actor_follow.follower_id
  where actor_follow.follower_id = new.owner_id;
  return new;
end;
$$;

revoke all on function public.notify_entrelinhas_mutual_friends_new_book() from public;
drop trigger if exists on_entrelinhas_book_created on public.books;
create trigger on_entrelinhas_book_created
after insert on public.books
for each row execute function public.notify_entrelinhas_mutual_friends_new_book();

-- Gera avisos para seguidores que já existiam quando a primeira versão foi instalada.
insert into public.notifications (recipient_id, actor_id, kind)
select f.followed_id, f.follower_id, 'new_follower'
from public.follows f
where not exists (
  select 1
  from public.notifications n
  where n.recipient_id = f.followed_id
    and n.actor_id = f.follower_id
    and n.kind = 'new_follower'
);

-- Ativa atualizações em tempo real para o sino no navegador.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
