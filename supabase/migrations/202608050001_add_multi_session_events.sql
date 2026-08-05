-- Multi-date / multi-session event support.
alter table public.events add column if not exists is_multi_session boolean not null default false;

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_session_time_valid check (end_at > start_at),
  constraint event_session_capacity_valid check (capacity >= confirmed_count),
  unique(event_id, start_at)
);

alter table public.registrations add column if not exists session_id uuid references public.event_sessions(id) on delete restrict;
create index if not exists event_sessions_event_start_idx on public.event_sessions(event_id, start_at);
create index if not exists registrations_session_idx on public.registrations(session_id, status);

alter table public.event_sessions enable row level security;
drop policy if exists "Public can read active published event sessions" on public.event_sessions;
create policy "Public can read active published event sessions" on public.event_sessions for select to anon, authenticated
using (is_active and exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
revoke all on public.event_sessions from anon, authenticated;
grant select on public.event_sessions to anon, authenticated;
grant all on public.event_sessions to service_role;

create or replace function public.sync_event_and_session_counts()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_confirmed boolean := false;
  new_confirmed boolean := false;
  target_session public.event_sessions%rowtype;
begin
  if tg_op <> 'INSERT' then old_confirmed := old.status = 'confirmed'; end if;
  if tg_op <> 'DELETE' then new_confirmed := new.status = 'confirmed'; end if;

  if tg_op = 'INSERT' then
    if new_confirmed then
      if new.session_id is not null then
        select * into target_session from public.event_sessions where id = new.session_id and event_id = new.event_id for update;
        if not found then raise exception 'SESSION_NOT_FOUND'; end if;
        if not target_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
        if target_session.confirmed_count >= target_session.capacity then raise exception 'SESSION_FULL'; end if;
        update public.event_sessions set confirmed_count = confirmed_count + 1 where id = new.session_id;
      end if;
      update public.events set confirmed_count = confirmed_count + 1 where id = new.event_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old_confirmed then
      if old.session_id is not null then update public.event_sessions set confirmed_count = greatest(0, confirmed_count - 1) where id = old.session_id; end if;
      update public.events set confirmed_count = greatest(0, confirmed_count - 1) where id = old.event_id;
    end if;
    return old;
  end if;

  if old_confirmed and (not new_confirmed or old.event_id <> new.event_id or old.session_id is distinct from new.session_id) then
    if old.session_id is not null then update public.event_sessions set confirmed_count = greatest(0, confirmed_count - 1) where id = old.session_id; end if;
    update public.events set confirmed_count = greatest(0, confirmed_count - 1) where id = old.event_id;
  end if;

  if new_confirmed and (not old_confirmed or old.event_id <> new.event_id or old.session_id is distinct from new.session_id) then
    if new.session_id is not null then
      select * into target_session from public.event_sessions where id = new.session_id and event_id = new.event_id for update;
      if not found then raise exception 'SESSION_NOT_FOUND'; end if;
      if not target_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
      if target_session.confirmed_count >= target_session.capacity then raise exception 'SESSION_FULL'; end if;
      update public.event_sessions set confirmed_count = confirmed_count + 1 where id = new.session_id;
    end if;
    update public.events set confirmed_count = confirmed_count + 1 where id = new.event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_sync_confirmed_count on public.registrations;
create trigger registrations_sync_confirmed_count before insert or update of status, event_id, session_id or delete on public.registrations
for each row execute function public.sync_event_and_session_counts();

-- Reconcile existing aggregate counts.
update public.events e set confirmed_count = (select count(*) from public.registrations r where r.event_id=e.id and r.status='confirmed');
update public.event_sessions s set confirmed_count = (select count(*) from public.registrations r where r.session_id=s.id and r.status='confirmed');

-- Public registration RPC with optional session selection.
drop function if exists public.register_for_event(uuid, text, text, text, public.registration_method, text);
create or replace function public.register_for_event(
  p_event_id uuid,
  p_session_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_method public.registration_method,
  p_notes text default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  target_event public.events%rowtype;
  target_session public.event_sessions%rowtype;
  created_registration public.registrations%rowtype;
  normalized_email text := nullif(lower(trim(p_email)), '');
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target_event.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if target_event.registration_start_at > now() then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if target_event.registration_deadline <= now() then raise exception 'REGISTRATION_CLOSED'; end if;
  if not (p_method = any(target_event.registration_methods)) then raise exception 'METHOD_NOT_ALLOWED'; end if;

  if target_event.is_multi_session then
    if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;
    select * into target_session from public.event_sessions where id=p_session_id and event_id=p_event_id for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if not target_session.is_active or target_session.start_at <= now() then raise exception 'SESSION_NOT_ACTIVE'; end if;
    if target_session.confirmed_count >= target_session.capacity then raise exception 'SESSION_FULL'; end if;
  else
    if target_event.confirmed_count >= target_event.capacity then raise exception 'EVENT_FULL'; end if;
    p_session_id := null;
  end if;

  if normalized_email is not null and exists (
    select 1 from public.registrations where event_id=p_event_id and lower(email)=normalized_email and status in ('confirmed','waitlist')
  ) then raise exception 'ALREADY_REGISTERED'; end if;

  insert into public.registrations(event_id, session_id, registration_no, full_name, email, phone, method, notes)
  values (p_event_id, p_session_id,
    'ER'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    trim(p_full_name), normalized_email, trim(p_phone), p_method, nullif(trim(p_notes),''))
  returning * into created_registration;
  return to_jsonb(created_registration);
exception when unique_violation then raise exception 'ALREADY_REGISTERED';
end;
$$;
revoke all on function public.register_for_event(uuid, uuid, text, text, text, public.registration_method, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text, text, text, public.registration_method, text) to service_role;
