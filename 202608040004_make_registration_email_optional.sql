-- Make participant email optional while keeping duplicate-email protection when provided.

alter table public.registrations
  alter column email drop not null;

update public.registrations
set email = null
where email is not null and btrim(email) = '';

drop index if exists public.registrations_email_idx;
create index registrations_email_idx
  on public.registrations(event_id, lower(email))
  where email is not null;

drop index if exists public.one_active_registration_per_email;
create unique index one_active_registration_per_email
  on public.registrations(event_id, lower(email))
  where email is not null and status in ('confirmed', 'waitlist');

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
  normalized_email text := nullif(lower(trim(p_email)), '');
  violated_constraint text;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target_event.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if target_event.registration_start_at > now() then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if target_event.registration_deadline <= now() then raise exception 'REGISTRATION_CLOSED'; end if;
  if not (p_method = any(target_event.registration_methods)) then raise exception 'METHOD_NOT_ALLOWED'; end if;
  if target_event.confirmed_count >= target_event.capacity then raise exception 'EVENT_FULL'; end if;

  if normalized_email is not null and exists (
    select 1 from public.registrations
    where event_id = p_event_id
      and lower(email) = normalized_email
      and status in ('confirmed', 'waitlist')
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  insert into public.registrations (
    event_id, registration_no, full_name, email, phone, method, notes
  ) values (
    p_event_id,
    'ER' || to_char(now() at time zone 'Asia/Hong_Kong', 'YYYYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    trim(p_full_name), normalized_email, trim(p_phone), p_method, nullif(trim(p_notes), '')
  ) returning * into created_registration;

  return to_jsonb(created_registration);
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'one_active_registration_per_email' then
      raise exception 'ALREADY_REGISTERED';
    end if;
    raise;
end;
$$;

revoke all on function public.register_for_event(uuid, text, text, text, public.registration_method, text)
  from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text, text, public.registration_method, text)
  to service_role;
