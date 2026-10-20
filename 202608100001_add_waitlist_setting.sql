-- Per-event waitlist setting. Confirmed capacity remains unchanged; public registrations fall back to waitlist only after confirmed places are full.
alter table public.events add column if not exists accepts_waitlist boolean not null default false;

comment on column public.events.accepts_waitlist is 'Allow public waitlist registrations after confirmed capacity is full.';

drop function if exists public.register_for_event(uuid, uuid, text, text, text, public.registration_method, text);
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
  target_status public.registration_status := 'confirmed';
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
    if target_session.confirmed_count >= target_session.capacity then
      if target_event.accepts_waitlist then target_status := 'waitlist'; else raise exception 'SESSION_FULL'; end if;
    end if;
  else
    p_session_id := null;
    if target_event.confirmed_count >= target_event.capacity then
      if target_event.accepts_waitlist then target_status := 'waitlist'; else raise exception 'EVENT_FULL'; end if;
    end if;
  end if;

  if normalized_email is not null and exists (
    select 1 from public.registrations where event_id=p_event_id and lower(email)=normalized_email and status in ('confirmed','waitlist')
  ) then raise exception 'ALREADY_REGISTERED'; end if;

  insert into public.registrations(event_id, session_id, registration_no, full_name, email, phone, method, status, notes)
  values (p_event_id, p_session_id,
    'ER'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    trim(p_full_name), normalized_email, trim(p_phone), p_method, target_status, nullif(trim(p_notes),''))
  returning * into created_registration;
  return to_jsonb(created_registration);
exception when unique_violation then raise exception 'ALREADY_REGISTERED';
end;
$$;

revoke all on function public.register_for_event(uuid, uuid, text, text, text, public.registration_method, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text, text, text, public.registration_method, text) to service_role;
