-- Safely replace all sessions for a multi-session event in one database transaction.
-- Existing sessions are first moved to temporary timestamps so swapping/reusing
-- start times cannot violate the unique(event_id, start_at) constraint mid-update.

create or replace function public.replace_event_sessions_safe(
  p_event_id uuid,
  p_sessions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_count integer := 0;
  v_final_count integer := 0;
  v_new_count integer := 0;
  v_removed_count integer := 0;
begin
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'INVALID_SESSION_PAYLOAD';
  end if;

  if jsonb_array_length(p_sessions) = 0 then
    raise exception 'SESSION_REQUIRED';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- Lock current sessions for the whole RPC transaction.
  perform 1 from public.event_sessions where event_id = p_event_id for update;

  create temporary table session_update_plan (
    id uuid,
    session_date date not null,
    start_at timestamptz not null,
    end_at timestamptz not null,
    capacity integer not null,
    sort_order integer not null,
    is_active boolean not null
  ) on commit drop;

  insert into session_update_plan(id, session_date, start_at, end_at, capacity, sort_order, is_active)
  select
    x.id,
    x.session_date,
    x.start_at,
    x.end_at,
    x.capacity,
    x.sort_order,
    coalesce(x.is_active, true)
  from jsonb_to_recordset(p_sessions) as x(
    id uuid,
    session_date date,
    start_at timestamptz,
    end_at timestamptz,
    capacity integer,
    sort_order integer,
    is_active boolean
  );

  select count(*) into v_final_count from session_update_plan;
  select count(*) into v_existing_count from public.event_sessions where event_id = p_event_id;
  select count(*) into v_new_count from session_update_plan where id is null;

  if exists (select 1 from session_update_plan where end_at <= start_at) then
    raise exception 'SESSION_END_BEFORE_START';
  end if;

  if exists (select 1 from session_update_plan where capacity < 1) then
    raise exception 'INVALID_SESSION_CAPACITY';
  end if;

  if exists (
    select 1 from session_update_plan
    group by start_at
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_SESSION_START';
  end if;

  if exists (
    select 1 from session_update_plan
    where id is not null
    group by id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_SESSION_ID';
  end if;

  if exists (
    select 1
    from session_update_plan p
    left join public.event_sessions s on s.id = p.id and s.event_id = p_event_id
    where p.id is not null and s.id is null
  ) then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if exists (
    select 1
    from session_update_plan p
    join public.event_sessions s on s.id = p.id and s.event_id = p_event_id
    where p.capacity < s.confirmed_count
  ) then
    raise exception 'SESSION_CAPACITY_BELOW_CONFIRMED';
  end if;

  -- Do not remove a session referenced by any historical/current registration.
  if exists (
    select 1
    from public.event_sessions s
    where s.event_id = p_event_id
      and not exists (select 1 from session_update_plan p where p.id = s.id)
      and exists (select 1 from public.registrations r where r.session_id = s.id)
  ) then
    raise exception 'SESSION_HAS_REGISTRATIONS';
  end if;

  select count(*) into v_removed_count
  from public.event_sessions s
  where s.event_id = p_event_id
    and not exists (select 1 from session_update_plan p where p.id = s.id);

  -- Phase 1: temporarily move every existing start time away from the final range.
  -- This permits swaps such as 14:00 <-> 14:30 without hitting the unique key.
  with ranked as (
    select id, row_number() over (order by id) as rn
    from public.event_sessions
    where event_id = p_event_id
  )
  update public.event_sessions s
  set
    session_date = date '9990-01-01',
    start_at = timestamptz '9990-01-01 00:00:00+00' + (ranked.rn * interval '2 minutes'),
    end_at = timestamptz '9990-01-01 00:01:00+00' + (ranked.rn * interval '2 minutes'),
    updated_at = now()
  from ranked
  where s.id = ranked.id;

  -- Phase 2: restore every retained session to its requested final values.
  update public.event_sessions s
  set
    session_date = p.session_date,
    start_at = p.start_at,
    end_at = p.end_at,
    capacity = p.capacity,
    sort_order = p.sort_order,
    is_active = p.is_active,
    updated_at = now()
  from session_update_plan p
  where p.id is not null
    and s.id = p.id
    and s.event_id = p_event_id;

  -- Insert brand new sessions only after all existing rows have left their old times.
  insert into public.event_sessions(event_id, session_date, start_at, end_at, capacity, sort_order, is_active)
  select p_event_id, p.session_date, p.start_at, p.end_at, p.capacity, p.sort_order, p.is_active
  from session_update_plan p
  where p.id is null;

  -- Remove unreferenced sessions omitted from the final plan.
  delete from public.event_sessions s
  where s.event_id = p_event_id
    and not exists (select 1 from session_update_plan p where p.id = s.id);

  return jsonb_build_object(
    'ok', true,
    'previous_count', v_existing_count,
    'final_count', v_final_count,
    'new_count', v_new_count,
    'removed_count', v_removed_count
  );
end;
$$;

revoke all on function public.replace_event_sessions_safe(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_event_sessions_safe(uuid, jsonb) to service_role;
