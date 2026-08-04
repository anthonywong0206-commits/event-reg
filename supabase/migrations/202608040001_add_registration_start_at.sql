-- Add scheduled registration opening to existing deployments.

alter table public.events
  add column if not exists registration_start_at timestamptz;

-- Existing activities remain open immediately (or from their original creation time).
update public.events
set registration_start_at = least(coalesce(created_at, now()), registration_deadline)
where registration_start_at is null;

alter table public.events
  alter column registration_start_at set default now(),
  alter column registration_start_at set not null;

do $$ begin
  alter table public.events
    add constraint valid_registration_window
    check (registration_start_at <= registration_deadline);
exception when duplicate_object then null; end $$;

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
