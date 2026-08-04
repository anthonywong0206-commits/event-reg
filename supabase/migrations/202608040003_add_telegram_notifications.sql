-- Telegram registration notifications for the event registration platform.
-- Bot tokens remain in server environment variables and are never stored in Postgres.

create table if not exists public.event_telegram_notification_settings (
  setting_key text primary key default 'admin',
  enabled boolean not null default false,
  frequency text not null default 'instant'
    check (frequency in ('instant', '3h', '12h', 'daily')),
  chat_id text,
  chat_label text,
  bot_username text,
  connect_token uuid,
  connect_expires_at timestamptz,
  connected_at timestamptz,
  last_digest_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_telegram_settings_singleton check (setting_key = 'admin'),
  constraint event_telegram_enabled_requires_chat check (not enabled or chat_id is not null)
);

create index if not exists event_telegram_settings_updated_by_idx
  on public.event_telegram_notification_settings(updated_by);

insert into public.event_telegram_notification_settings (setting_key)
values ('admin')
on conflict (setting_key) do nothing;

create table if not exists public.event_telegram_notification_queue (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  processing_at timestamptz,
  delivered_at timestamptz,
  discarded_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists event_telegram_queue_pending_idx
  on public.event_telegram_notification_queue(created_at)
  where delivered_at is null and discarded_at is null;

create index if not exists event_telegram_queue_event_idx
  on public.event_telegram_notification_queue(event_id);

create or replace function public.enqueue_event_telegram_notification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status in ('confirmed', 'waitlist')
     and exists (
       select 1
       from public.event_telegram_notification_settings
       where setting_key = 'admin'
         and enabled = true
         and chat_id is not null
     ) then
    insert into public.event_telegram_notification_queue (registration_id, event_id)
    values (new.id, new.event_id)
    on conflict (registration_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_event_telegram_notification() from public, anon, authenticated;

drop trigger if exists registrations_enqueue_telegram_notification on public.registrations;
create trigger registrations_enqueue_telegram_notification
after insert on public.registrations
for each row execute function public.enqueue_event_telegram_notification();

create or replace function public.claim_event_telegram_notifications(
  p_limit integer default 100,
  p_registration_id uuid default null
)
returns setof public.event_telegram_notification_queue
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  update public.event_telegram_notification_queue as queue
  set
    processing_at = now(),
    attempts = queue.attempts + 1,
    last_error = null
  where queue.id in (
    select pending.id
    from public.event_telegram_notification_queue as pending
    where pending.delivered_at is null
      and pending.discarded_at is null
      and (pending.processing_at is null or pending.processing_at < now() - interval '10 minutes')
      and (p_registration_id is null or pending.registration_id = p_registration_id)
    order by pending.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  returning queue.*;
end;
$$;

revoke all on function public.claim_event_telegram_notifications(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_event_telegram_notifications(integer, uuid)
  to service_role;

alter table public.event_telegram_notification_settings enable row level security;
alter table public.event_telegram_notification_queue enable row level security;

drop policy if exists "No client access to Telegram settings" on public.event_telegram_notification_settings;
create policy "No client access to Telegram settings"
on public.event_telegram_notification_settings
for all to anon, authenticated
using (false)
with check (false);

drop policy if exists "No client access to Telegram queue" on public.event_telegram_notification_queue;
create policy "No client access to Telegram queue"
on public.event_telegram_notification_queue
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.event_telegram_notification_settings from anon, authenticated;
revoke all on table public.event_telegram_notification_queue from anon, authenticated;

grant select, insert, update, delete on table public.event_telegram_notification_settings to service_role;
grant select, insert, update, delete on table public.event_telegram_notification_queue to service_role;

drop trigger if exists event_telegram_settings_set_updated_at
  on public.event_telegram_notification_settings;
create trigger event_telegram_settings_set_updated_at
before update on public.event_telegram_notification_settings
for each row execute function public.set_updated_at();
