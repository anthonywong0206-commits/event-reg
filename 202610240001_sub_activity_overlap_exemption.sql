-- Sub-activity overlap exemption and stable sub-activity registration behavior.
alter table public.event_sub_activities
  add column if not exists overlap_exempt boolean not null default false;

comment on column public.event_sub_activities.overlap_exempt is
  'When true, this sub-activity may overlap in time with other selected sub-activities for the same participant.';

create or replace function public.replace_event_sub_activities_v2(p_event_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_defs integer:=0;
  v_sessions integer:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_SUB_ACTIVITY_PAYLOAD'; end if;
  if jsonb_array_length(p_items)>50 then raise exception 'TOO_MANY_SUB_ACTIVITIES'; end if;
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  perform 1 from public.event_sub_activities where event_id=p_event_id for update;
  perform 1 from public.event_sub_activity_sessions where event_id=p_event_id for update;

  create temporary table sub_activity_plan(
    id uuid primary key,
    name text not null,
    sort_order integer not null,
    is_active boolean not null,
    overlap_exempt boolean not null
  ) on commit drop;
  create temporary table sub_activity_session_plan(
    id uuid primary key,
    sub_activity_id uuid not null,
    session_date date not null,
    start_at timestamptz not null,
    end_at timestamptz not null,
    capacity integer not null,
    sort_order integer not null,
    is_active boolean not null
  ) on commit drop;

  insert into sub_activity_plan(id,name,sort_order,is_active,overlap_exempt)
  select (x.item->>'id')::uuid, trim(x.item->>'name'), x.ord::integer-1,
         coalesce((x.item->>'is_active')::boolean,true),
         coalesce((x.item->>'overlap_exempt')::boolean,false)
  from jsonb_array_elements(p_items) with ordinality x(item,ord);

  if exists(select 1 from sub_activity_plan where length(name)=0) then raise exception 'SUB_ACTIVITY_NAME_REQUIRED'; end if;
  if exists(select 1 from sub_activity_plan group by lower(name) having count(*)>1) then raise exception 'DUPLICATE_SUB_ACTIVITY_NAME'; end if;
  if exists(select 1 from sub_activity_plan p join public.event_sub_activities a on a.id=p.id where a.event_id<>p_event_id) then raise exception 'SUB_ACTIVITY_ID_CONFLICT'; end if;

  insert into sub_activity_session_plan(id,sub_activity_id,session_date,start_at,end_at,capacity,sort_order,is_active)
  select (s.item->>'id')::uuid,
         (a.item->>'id')::uuid,
         (s.item->>'session_date')::date,
         (s.item->>'start_at')::timestamptz,
         (s.item->>'end_at')::timestamptz,
         (s.item->>'capacity')::integer,
         s.ord::integer-1,
         coalesce((s.item->>'is_active')::boolean,true)
  from jsonb_array_elements(p_items) with ordinality a(item,aord)
  cross join lateral jsonb_array_elements(coalesce(a.item->'sessions','[]'::jsonb)) with ordinality s(item,ord);

  if exists(select 1 from sub_activity_session_plan where end_at<=start_at) then raise exception 'SESSION_END_BEFORE_START'; end if;
  if exists(select 1 from sub_activity_session_plan where capacity<1 or capacity>100000) then raise exception 'INVALID_SESSION_CAPACITY'; end if;
  if exists(select 1 from sub_activity_session_plan p left join sub_activity_plan a on a.id=p.sub_activity_id where a.id is null) then raise exception 'SUB_ACTIVITY_NOT_FOUND'; end if;
  if exists(select 1 from sub_activity_session_plan group by sub_activity_id,start_at having count(*)>1) then raise exception 'DUPLICATE_SESSION_START'; end if;
  if exists(select 1 from sub_activity_session_plan p join public.event_sub_activity_sessions s on s.id=p.id where s.event_id<>p_event_id) then raise exception 'SESSION_ID_CONFLICT'; end if;
  if exists(select 1 from sub_activity_session_plan p join public.event_sub_activity_sessions s on s.id=p.id and s.event_id=p_event_id where p.capacity<s.confirmed_count) then raise exception 'SESSION_CAPACITY_BELOW_CONFIRMED'; end if;

  if exists(
    select 1 from public.event_sub_activity_sessions s
    where s.event_id=p_event_id
      and not exists(select 1 from sub_activity_session_plan p where p.id=s.id)
      and exists(select 1 from public.registrations r where r.sub_activity_session_id=s.id)
  ) then raise exception 'SESSION_HAS_REGISTRATIONS'; end if;
  if exists(
    select 1 from public.event_sub_activities a
    where a.event_id=p_event_id
      and not exists(select 1 from sub_activity_plan p where p.id=a.id)
      and exists(select 1 from public.registrations r where r.sub_activity_id=a.id)
  ) then raise exception 'SUB_ACTIVITY_HAS_REGISTRATIONS'; end if;

  insert into public.event_sub_activities(id,event_id,name,sort_order,is_active,overlap_exempt,updated_at)
  select id,p_event_id,name,sort_order,is_active,overlap_exempt,now() from sub_activity_plan
  on conflict(id) do update set
    name=excluded.name,
    sort_order=excluded.sort_order,
    is_active=excluded.is_active,
    overlap_exempt=excluded.overlap_exempt,
    updated_at=now();

  insert into public.event_sub_activity_sessions(id,event_id,sub_activity_id,session_date,start_at,end_at,capacity,sort_order,is_active,updated_at)
  select id,p_event_id,sub_activity_id,session_date,start_at,end_at,capacity,sort_order,is_active,now()
  from sub_activity_session_plan
  on conflict(id) do update set
    sub_activity_id=excluded.sub_activity_id,
    session_date=excluded.session_date,
    start_at=excluded.start_at,
    end_at=excluded.end_at,
    capacity=excluded.capacity,
    sort_order=excluded.sort_order,
    is_active=excluded.is_active,
    updated_at=now();

  delete from public.event_sub_activity_sessions s
  where s.event_id=p_event_id and not exists(select 1 from sub_activity_session_plan p where p.id=s.id);
  delete from public.event_sub_activities a
  where a.event_id=p_event_id and not exists(select 1 from sub_activity_plan p where p.id=a.id);

  select count(*) into v_defs from sub_activity_plan;
  select count(*) into v_sessions from sub_activity_session_plan;
  return jsonb_build_object('ok',true,'sub_activity_count',v_defs,'session_count',v_sessions);
end; $$;
revoke all on function public.replace_event_sub_activities_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_event_sub_activities_v2(uuid,jsonb) to service_role;

create or replace function public.register_for_sub_activity_bundle_v2(
  p_event_id uuid,
  p_session_ids uuid[],
  p_full_name text,
  p_email text,
  p_phone text,
  p_method public.registration_method,
  p_notes text,
  p_custom_answers jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  target_event public.events%rowtype;
  session_row public.event_sub_activity_sessions%rowtype;
  normalized_email text:=nullif(lower(trim(p_email)),'');
  normalized_phone text:=trim(p_phone);
  selected_count integer;
  distinct_activities integer;
  target_status public.registration_status;
  group_id uuid:=gen_random_uuid();
  created_registration public.registrations%rowtype;
  created_rows jsonb:='[]'::jsonb;
begin
  select * into target_event from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target_event.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if target_event.event_mode<>'sub_activity' then raise exception 'SUB_ACTIVITY_MODE_REQUIRED'; end if;
  if target_event.registration_start_at>now() then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if target_event.registration_deadline<=now() then raise exception 'REGISTRATION_CLOSED'; end if;
  if not (p_method=any(target_event.registration_methods)) then raise exception 'METHOD_NOT_ALLOWED'; end if;
  if p_session_ids is null or cardinality(p_session_ids)=0 then raise exception 'SESSION_REQUIRED'; end if;

  select count(distinct x) into selected_count from unnest(p_session_ids) x;
  if selected_count<>cardinality(p_session_ids) then raise exception 'DUPLICATE_SESSION_SELECTION'; end if;
  if selected_count>target_event.max_sub_activity_selections then raise exception 'TOO_MANY_SUB_ACTIVITIES'; end if;

  perform 1 from public.event_sub_activity_sessions s where s.event_id=p_event_id and s.id=any(p_session_ids) for update;
  if (select count(*) from public.event_sub_activity_sessions s where s.event_id=p_event_id and s.id=any(p_session_ids))<>selected_count then raise exception 'SESSION_NOT_FOUND'; end if;
  if exists(select 1 from public.event_sub_activity_sessions s where s.id=any(p_session_ids) and (not s.is_active or s.start_at<=now())) then raise exception 'SESSION_NOT_ACTIVE'; end if;
  select count(distinct sub_activity_id) into distinct_activities from public.event_sub_activity_sessions where id=any(p_session_ids);
  if distinct_activities<>selected_count then raise exception 'ONE_SESSION_PER_SUB_ACTIVITY'; end if;

  -- Selected sessions may overlap when either participating sub-activity is marked exempt.
  if exists(
    select 1
    from public.event_sub_activity_sessions a
    join public.event_sub_activities aa on aa.id=a.sub_activity_id
    join public.event_sub_activity_sessions b on a.id<b.id
    join public.event_sub_activities ba on ba.id=b.sub_activity_id
    where a.id=any(p_session_ids) and b.id=any(p_session_ids)
      and not aa.overlap_exempt and not ba.overlap_exempt
      and a.start_at<b.end_at and b.start_at<a.end_at
  ) then raise exception 'SESSION_TIME_CONFLICT'; end if;

  -- Existing bookings use the same rule: a clash is ignored if either old or new sub-activity is exempt.
  if exists(
    select 1
    from public.registrations r
    join public.event_sub_activity_sessions old_s on old_s.id=r.sub_activity_session_id
    join public.event_sub_activities old_a on old_a.id=old_s.sub_activity_id
    join public.event_sub_activity_sessions new_s on new_s.id=any(p_session_ids)
    join public.event_sub_activities new_a on new_a.id=new_s.sub_activity_id
    where r.event_id=p_event_id and r.status in ('confirmed','waitlist')
      and ((normalized_email is not null and lower(r.email)=normalized_email) or trim(r.phone)=normalized_phone)
      and not old_a.overlap_exempt and not new_a.overlap_exempt
      and old_s.start_at<new_s.end_at and new_s.start_at<old_s.end_at
  ) then raise exception 'SESSION_TIME_CONFLICT'; end if;

  for session_row in
    select * from public.event_sub_activity_sessions where id=any(p_session_ids) order by start_at,id
  loop
    target_status:='confirmed';
    if session_row.confirmed_count>=session_row.capacity then
      if target_event.accepts_waitlist then target_status:='waitlist'; else raise exception 'SESSION_FULL'; end if;
    end if;
    if normalized_email is not null and exists(
      select 1 from public.registrations
      where event_id=p_event_id and sub_activity_session_id=session_row.id
        and lower(email)=normalized_email and status in ('confirmed','waitlist')
    ) then raise exception 'ALREADY_REGISTERED'; end if;

    insert into public.registrations(
      event_id,session_id,sub_activity_id,sub_activity_session_id,registration_group_id,
      registration_no,full_name,email,phone,method,status,notes,custom_answers
    ) values(
      p_event_id,null,session_row.sub_activity_id,session_row.id,group_id,
      'ER'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      trim(p_full_name),normalized_email,normalized_phone,p_method,target_status,nullif(trim(p_notes),''),coalesce(p_custom_answers,'{}'::jsonb)
    ) returning * into created_registration;
    created_rows:=created_rows||jsonb_build_array(to_jsonb(created_registration));
  end loop;
  return jsonb_build_object('registration_group_id',group_id,'registrations',created_rows);
end; $$;
revoke all on function public.register_for_sub_activity_bundle_v2(uuid,uuid[],text,text,text,public.registration_method,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_for_sub_activity_bundle_v2(uuid,uuid[],text,text,text,public.registration_method,text,jsonb) to service_role;
