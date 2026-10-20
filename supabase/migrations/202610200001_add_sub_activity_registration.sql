-- Sub-activity selection for multi-session events.
alter table public.events
  add column if not exists sub_activity_mode boolean not null default false,
  add column if not exists max_sub_activity_selections integer not null default 1;

alter table public.events drop constraint if exists events_max_sub_activity_selections_check;
alter table public.events add constraint events_max_sub_activity_selections_check
  check (max_sub_activity_selections between 1 and 50);

alter table public.event_sessions
  add column if not exists sub_activity_name text;

alter table public.registrations
  add column if not exists registration_group_id uuid;

create index if not exists registrations_group_idx on public.registrations(registration_group_id);

-- The legacy unique index blocked multiple sub-activities in one parent event.
drop index if exists public.one_active_registration_per_email;
create unique index if not exists one_active_registration_per_email_single_event
  on public.registrations(event_id, lower(email))
  where email is not null and session_id is null and status in ('confirmed','waitlist');
create unique index if not exists one_active_registration_per_email_session
  on public.registrations(event_id, session_id, lower(email))
  where email is not null and session_id is not null and status in ('confirmed','waitlist');

comment on column public.events.sub_activity_mode is 'When true, users may select multiple named sub-activities and one session per selected sub-activity.';
comment on column public.events.max_sub_activity_selections is 'Maximum number of sub-activities selectable in one submission.';
comment on column public.event_sessions.sub_activity_name is 'Optional sub-activity name used to group sessions in sub-activity mode.';
comment on column public.registrations.registration_group_id is 'Groups multiple registration rows created from one sub-activity submission.';

-- Replace safe session update RPC so sub-activity names are preserved atomically.
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
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then raise exception 'INVALID_SESSION_PAYLOAD'; end if;
  if jsonb_array_length(p_sessions) = 0 then raise exception 'SESSION_REQUIRED'; end if;
  perform 1 from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  perform 1 from public.event_sessions where event_id = p_event_id for update;

  create temporary table session_update_plan (
    id uuid,
    session_date date not null,
    start_at timestamptz not null,
    end_at timestamptz not null,
    capacity integer not null,
    sort_order integer not null,
    is_active boolean not null,
    sub_activity_name text
  ) on commit drop;

  insert into session_update_plan(id, session_date, start_at, end_at, capacity, sort_order, is_active, sub_activity_name)
  select x.id, x.session_date, x.start_at, x.end_at, x.capacity, x.sort_order, coalesce(x.is_active,true), nullif(trim(x.sub_activity_name),'')
  from jsonb_to_recordset(p_sessions) as x(
    id uuid, session_date date, start_at timestamptz, end_at timestamptz,
    capacity integer, sort_order integer, is_active boolean, sub_activity_name text
  );

  select count(*) into v_final_count from session_update_plan;
  select count(*) into v_existing_count from public.event_sessions where event_id=p_event_id;
  select count(*) into v_new_count from session_update_plan where id is null;
  if exists(select 1 from session_update_plan where end_at <= start_at) then raise exception 'SESSION_END_BEFORE_START'; end if;
  if exists(select 1 from session_update_plan where capacity < 1) then raise exception 'INVALID_SESSION_CAPACITY'; end if;
  if exists(select 1 from session_update_plan group by start_at having count(*)>1) then raise exception 'DUPLICATE_SESSION_START'; end if;
  if exists(select 1 from session_update_plan where id is not null group by id having count(*)>1) then raise exception 'DUPLICATE_SESSION_ID'; end if;
  if exists(select 1 from session_update_plan p left join public.event_sessions s on s.id=p.id and s.event_id=p_event_id where p.id is not null and s.id is null) then raise exception 'SESSION_NOT_FOUND'; end if;
  if exists(select 1 from session_update_plan p join public.event_sessions s on s.id=p.id and s.event_id=p_event_id where p.capacity < s.confirmed_count) then raise exception 'SESSION_CAPACITY_BELOW_CONFIRMED'; end if;
  if exists(
    select 1 from public.event_sessions s
    where s.event_id=p_event_id and not exists(select 1 from session_update_plan p where p.id=s.id)
      and exists(select 1 from public.registrations r where r.session_id=s.id)
  ) then raise exception 'SESSION_HAS_REGISTRATIONS'; end if;

  select count(*) into v_removed_count from public.event_sessions s where s.event_id=p_event_id and not exists(select 1 from session_update_plan p where p.id=s.id);

  with ranked as (
    select id,row_number() over(order by id) rn from public.event_sessions where event_id=p_event_id
  )
  update public.event_sessions s set
    session_date=date '9990-01-01',
    start_at=timestamptz '9990-01-01 00:00:00+00'+(ranked.rn*interval '2 minutes'),
    end_at=timestamptz '9990-01-01 00:01:00+00'+(ranked.rn*interval '2 minutes'),
    updated_at=now()
  from ranked where s.id=ranked.id;

  update public.event_sessions s set
    session_date=p.session_date,start_at=p.start_at,end_at=p.end_at,capacity=p.capacity,
    sort_order=p.sort_order,is_active=p.is_active,sub_activity_name=p.sub_activity_name,updated_at=now()
  from session_update_plan p where p.id is not null and s.id=p.id and s.event_id=p_event_id;

  insert into public.event_sessions(event_id,session_date,start_at,end_at,capacity,sort_order,is_active,sub_activity_name)
  select p_event_id,p.session_date,p.start_at,p.end_at,p.capacity,p.sort_order,p.is_active,p.sub_activity_name
  from session_update_plan p where p.id is null;

  delete from public.event_sessions s where s.event_id=p_event_id and not exists(select 1 from session_update_plan p where p.id=s.id);
  return jsonb_build_object('ok',true,'previous_count',v_existing_count,'final_count',v_final_count,'new_count',v_new_count,'removed_count',v_removed_count);
end;
$$;
revoke all on function public.replace_event_sessions_safe(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_event_sessions_safe(uuid,jsonb) to service_role;

-- Atomic multi-sub-activity registration. One registration row is created for each chosen session.
create or replace function public.register_for_event_bundle(
  p_event_id uuid,
  p_session_ids uuid[],
  p_full_name text,
  p_email text,
  p_phone text,
  p_method public.registration_method,
  p_notes text,
  p_custom_answers jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  selected_count integer;
  distinct_names integer;
  normalized_email text := nullif(lower(trim(p_email)), '');
  normalized_phone text := trim(p_phone);
  group_id uuid := gen_random_uuid();
  session_row public.event_sessions%rowtype;
  target_status public.registration_status;
  created_rows jsonb := '[]'::jsonb;
  created_registration public.registrations%rowtype;
begin
  select * into target_event from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target_event.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if target_event.registration_start_at > now() then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if target_event.registration_deadline <= now() then raise exception 'REGISTRATION_CLOSED'; end if;
  if not target_event.is_multi_session or not target_event.sub_activity_mode then raise exception 'SUB_ACTIVITY_MODE_REQUIRED'; end if;
  if not (p_method = any(target_event.registration_methods)) then raise exception 'METHOD_NOT_ALLOWED'; end if;

  if p_session_ids is null or cardinality(p_session_ids)=0 then raise exception 'SESSION_REQUIRED'; end if;
  select count(distinct x) into selected_count from unnest(p_session_ids) x;
  if selected_count <> cardinality(p_session_ids) then raise exception 'DUPLICATE_SESSION_SELECTION'; end if;
  if selected_count > target_event.max_sub_activity_selections then raise exception 'TOO_MANY_SUB_ACTIVITIES'; end if;

  perform 1 from public.event_sessions s where s.event_id=p_event_id and s.id=any(p_session_ids) for update;
  if (select count(*) from public.event_sessions s where s.event_id=p_event_id and s.id=any(p_session_ids)) <> selected_count then raise exception 'SESSION_NOT_FOUND'; end if;
  if exists(select 1 from public.event_sessions s where s.id=any(p_session_ids) and (not s.is_active or s.start_at<=now())) then raise exception 'SESSION_NOT_ACTIVE'; end if;
  if exists(select 1 from public.event_sessions s where s.id=any(p_session_ids) and nullif(trim(s.sub_activity_name),'') is null) then raise exception 'SUB_ACTIVITY_NAME_REQUIRED'; end if;
  select count(distinct lower(trim(s.sub_activity_name))) into distinct_names from public.event_sessions s where s.id=any(p_session_ids);
  if distinct_names <> selected_count then raise exception 'ONE_SESSION_PER_SUB_ACTIVITY'; end if;

  if exists(
    select 1 from public.event_sessions a join public.event_sessions b on a.id<b.id
    where a.id=any(p_session_ids) and b.id=any(p_session_ids)
      and a.start_at < b.end_at and b.start_at < a.end_at
  ) then raise exception 'SESSION_TIME_CONFLICT'; end if;

  -- Also protect against overlap with an earlier active registration by the same participant within this parent event.
  if exists(
    select 1
    from public.registrations r
    join public.event_sessions old_s on old_s.id=r.session_id
    join public.event_sessions new_s on new_s.id=any(p_session_ids)
    where r.event_id=p_event_id and r.status in ('confirmed','waitlist')
      and ((normalized_email is not null and lower(r.email)=normalized_email) or trim(r.phone)=normalized_phone)
      and old_s.start_at < new_s.end_at and new_s.start_at < old_s.end_at
  ) then raise exception 'SESSION_TIME_CONFLICT'; end if;

  for session_row in select * from public.event_sessions where id=any(p_session_ids) order by start_at loop
    target_status := 'confirmed';
    if session_row.confirmed_count >= session_row.capacity then
      if target_event.accepts_waitlist then target_status := 'waitlist'; else raise exception 'SESSION_FULL'; end if;
    end if;
    if normalized_email is not null and exists(
      select 1 from public.registrations where event_id=p_event_id and session_id=session_row.id and lower(email)=normalized_email and status in ('confirmed','waitlist')
    ) then raise exception 'ALREADY_REGISTERED'; end if;

    insert into public.registrations(event_id,session_id,registration_group_id,registration_no,full_name,email,phone,method,status,notes,custom_answers)
    values(p_event_id,session_row.id,group_id,
      'ER'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      trim(p_full_name),normalized_email,normalized_phone,p_method,target_status,nullif(trim(p_notes),''),coalesce(p_custom_answers,'{}'::jsonb))
    returning * into created_registration;
    created_rows := created_rows || jsonb_build_array(to_jsonb(created_registration));
  end loop;
  return jsonb_build_object('registration_group_id',group_id,'registrations',created_rows);
end;
$$;
revoke all on function public.register_for_event_bundle(uuid,uuid[],text,text,text,public.registration_method,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_for_event_bundle(uuid,uuid[],text,text,text,public.registration_method,text,jsonb) to service_role;
