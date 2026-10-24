-- Diagnóstico de notificações: mostra o estado do gatilho e seguimentos recentes.
-- Execute no SQL Editor do mesmo projeto Supabase usado pelo site.

with trigger_check as (
  select exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.follows'::regclass
      and t.tgname = 'on_entrelinhas_follow_created'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) as active
)
select
  'Gatilho de novos seguidores'::text as verificacao,
  case when active then 'ATIVO' else 'AUSENTE OU DESATIVADO' end::text as resultado,
  ''::text as contas,
  ''::text as criado_em
from trigger_check
union all
select
  'Seguimento salvo'::text,
  case when n.id is null then 'SEM NOTIFICAÇÃO' else 'NOTIFICAÇÃO GRAVADA' end::text,
  coalesce(actor.username, f.follower_id::text) || ' → ' || coalesce(recipient.username, f.followed_id::text),
  coalesce(n.created_at::text, f.created_at::text)
from public.follows f
left join public.profiles actor on actor.id = f.follower_id
left join public.profiles recipient on recipient.id = f.followed_id
left join lateral (
  select notification.id, notification.created_at
  from public.notifications notification
  where notification.actor_id = f.follower_id
    and notification.recipient_id = f.followed_id
    and notification.kind = 'new_follower'
  order by notification.created_at desc
  limit 1
) n on true
where f.created_at >= now() - interval '30 days'
order by 1, 3;
