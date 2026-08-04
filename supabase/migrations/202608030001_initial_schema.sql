-- Event Register System initial schema
-- Run through Supabase Dashboard SQL Editor, or use the Supabase CLI migration workflow.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.event_status as enum ('draft', 'published', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_method as enum ('online', 'in_person');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_status as enum ('confirmed', 'cancelled', 'waitlist');
exception when duplicate_object then null; end $$;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 160),
  subtitle text,
  summary text not null,
  description text not null,
  category text not null,
  location text not null,
  address text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_start_at timestamptz not null default now(),
  registration_deadline timestamptz not null,
  capacity integer not null check (capacity > 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  status public.event_status not null default 'draft',
  registration_methods public.registration_method[] not null default array['online']::public.registration_method[],
  hero_image_url text not null,
  poster_image_url text not null,
  contact_name text,
  contact_phone text,
  contact_address text,
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_event_time check (end_at > start_at),
  constraint valid_registration_window check (registration_start_at <= registration_deadline),
  constraint valid_registration_deadline check (registration_deadline <= start_at),
  constraint capacity_not_below_count check (capacity >= confirmed_count),
  constraint at_least_one_method check (cardinality(registration_methods) > 0)
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  registration_no text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null,
  phone text not null,
  method public.registration_method not null,
  status public.registration_status not null default 'confirmed',
  qr_token uuid not null default gen_random_uuid() unique,
  attended_at timestamptz,
  notes text,
  email_sent boolean not null default false,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_public_start_idx on public.events(status, start_at);
create index if not exists registrations_event_idx on public.registrations(event_id, status);
create index if not exists registrations_email_idx on public.registrations(event_id, lower(email));
create index if not exists registrations_qr_idx on public.registrations(qr_token);
create unique index if not exists one_active_registration_per_email
  on public.registrations(event_id, lower(email))
  where status in ('confirmed', 'waitlist');

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = (select auth.uid())
      and role in ('admin', 'staff')
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_confirmed_count()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    select * into target_event from public.events where id = new.event_id for update;
    if target_event.confirmed_count >= target_event.capacity then
      raise exception 'EVENT_FULL';
    end if;
    update public.events set confirmed_count = confirmed_count + 1 where id = new.event_id;

  elsif tg_op = 'UPDATE' and old.event_id <> new.event_id then
    if old.status = 'confirmed' then
      update public.events set confirmed_count = greatest(0, confirmed_count - 1) where id = old.event_id;
    end if;
    if new.status = 'confirmed' then
      select * into target_event from public.events where id = new.event_id for update;
      if target_event.confirmed_count >= target_event.capacity then
        raise exception 'EVENT_FULL';
      end if;
      update public.events set confirmed_count = confirmed_count + 1 where id = new.event_id;
    end if;

  elsif tg_op = 'UPDATE' then
    if old.status <> 'confirmed' and new.status = 'confirmed' then
      select * into target_event from public.events where id = new.event_id for update;
      if target_event.confirmed_count >= target_event.capacity then
        raise exception 'EVENT_FULL';
      end if;
      update public.events set confirmed_count = confirmed_count + 1 where id = new.event_id;
    elsif old.status = 'confirmed' and new.status <> 'confirmed' then
      update public.events set confirmed_count = greatest(0, confirmed_count - 1) where id = old.event_id;
    end if;

  elsif tg_op = 'DELETE' and old.status = 'confirmed' then
    update public.events set confirmed_count = greatest(0, confirmed_count - 1) where id = old.event_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists registrations_set_updated_at on public.registrations;
create trigger registrations_set_updated_at before update on public.registrations
for each row execute function public.set_updated_at();

drop trigger if exists registrations_sync_confirmed_count on public.registrations;
create trigger registrations_sync_confirmed_count
before insert or update of status, event_id or delete on public.registrations
for each row execute function public.sync_confirmed_count();

create or replace function public.register_for_event(
  p_event_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_method public.registration_method,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  created_registration public.registrations%rowtype;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target_event.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if target_event.registration_start_at > now() then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if target_event.registration_deadline <= now() then raise exception 'REGISTRATION_CLOSED'; end if;
  if not (p_method = any(target_event.registration_methods)) then raise exception 'METHOD_NOT_ALLOWED'; end if;
  if target_event.confirmed_count >= target_event.capacity then raise exception 'EVENT_FULL'; end if;
  if exists (
    select 1 from public.registrations
    where event_id = p_event_id
      and lower(email) = lower(trim(p_email))
      and status in ('confirmed', 'waitlist')
  ) then raise exception 'ALREADY_REGISTERED'; end if;

  insert into public.registrations (
    event_id, registration_no, full_name, email, phone, method, notes
  ) values (
    p_event_id,
    'ER' || to_char(now() at time zone 'Asia/Hong_Kong', 'YYYYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    trim(p_full_name), lower(trim(p_email)), trim(p_phone), p_method, nullif(trim(p_notes), '')
  ) returning * into created_registration;

  return to_jsonb(created_registration);
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;
revoke all on function public.register_for_event(uuid, text, text, text, public.registration_method, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text, text, public.registration_method, text) to service_role;

alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.admin_profiles enable row level security;

-- Public visitors only see published events.
drop policy if exists "Public can read published events" on public.events;
create policy "Public can read published events" on public.events
for select to anon, authenticated
using (status = 'published');

-- Authenticated admin/staff can manage events.
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events" on public.events
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Admin profiles are readable only by the owner; service role creates them.
drop policy if exists "Users can read own admin profile" on public.admin_profiles;
create policy "Users can read own admin profile" on public.admin_profiles
for select to authenticated
using ((select auth.uid()) = user_id);

-- Registration records are not public. Admin/staff may read and update them.
drop policy if exists "Admins can read registrations" on public.registrations;
create policy "Admins can read registrations" on public.registrations
for select to authenticated
using ((select private.is_admin()));

drop policy if exists "Admins can update registrations" on public.registrations;
create policy "Admins can update registrations" on public.registrations
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Data API grants; RLS remains the row-level authority.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, update on public.registrations to authenticated;
grant select on public.admin_profiles to authenticated;
grant all on public.events, public.registrations, public.admin_profiles to service_role;

-- Public event media bucket. Uploads are performed server-side after admin validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view event media" on storage.objects;
create policy "Public can view event media" on storage.objects
for select to anon, authenticated
using (bucket_id = 'event-media');
