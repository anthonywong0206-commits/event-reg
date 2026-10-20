-- Sub-activity architecture v2: fully separates single, multi-session and sub-activity modes.
alter table public.events
  add column if not exists event_mode text not null default 'single';

update public.events
set event_mode = case
  when coalesce(external_registration, false) then 'external'
  when coalesce(sub_activity_mode, false) then 'sub_activity'
  when coalesce(is_multi_session, false) then 'multi_session'
  else 'single'
end
where event_mode is null or event_mode = 'single';

alter table public.events drop constraint if exists events_event_mode_check;
alter table public.events add constraint events_event_mode_check
  check (event_mode in ('single','multi_session','sub_activity','external'));

create table if not exists public.event_sub_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  legacy_key text,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_sub_activities_event_name_unique
  on public.event_sub_activities(event_id, lower(name));
create unique index if not exists event_sub_activities_legacy_key_unique
  on public.event_sub_activities(event_id, legacy_key)
  where legacy_key is not null;
create index if not exists event_sub_activities_event_sort_idx
  on public.event_sub_activities(event_id, sort_order, id);

create table if not exists public.event_sub_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sub_activity_id uuid not null references public.event_sub_activities(id) on delete cascade,
  legacy_session_id uuid,
  session_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sub_activity_session_time_valid check (end_at > start_at),
  constraint event_sub_activity_session_capacity_valid check (capacity >= confirmed_count)
);

create unique index if not exists event_sub_activity_session_start_unique
  on public.event_sub_activity_sessions(sub_activity_id, start_at);
create unique index if not exists event_sub_activity_session_legacy_unique
  on public.event_sub_activity_sessions(legacy_session_id)
  where legacy_session_id is not null;
create index if not exists event_sub_activity_sessions_event_start_idx
  on public.event_sub_activity_sessions(event_id, start_at);
create index if not exists event_sub_activity_sessions_sub_activity_idx
  on public.event_sub_activity_sessions(sub_activity_id, start_at);

alter table public.registrations
  add column if not exists sub_activity_id uuid references public.event_sub_activities(id) on delete restrict,
  add column if not exists sub_activity_session_id uuid references public.event_sub_activity_sessions(id) on delete restrict;
create index if not exists registrations_sub_activity_idx on public.registrations(sub_activity_id, status);
create index if not exists registrations_sub_activity_session_idx on public.registrations(sub_activity_session_id, status);
create unique index if not exists one_active_registration_per_email_sub_activity_session
  on public.registrations(event_id, sub_activity_session_id, lower(email))
  where email is not null and sub_activity_session_id is not null and status in ('confirmed','waitlist');

-- Public read access mirrors event_sessions.
alter table public.event_sub_activities enable row level security;
alter table public.event_sub_activity_sessions enable row level security;
drop policy if exists "Public can read active published sub activities" on public.event_sub_activities;
create policy "Public can read active published sub activities" on public.event_sub_activities
for select to anon, authenticated
using (is_active and exists (select 1 from public.events e where e.id=event_id and e.status='published'));
drop policy if exists "Public can read active published sub activity sessions" on public.event_sub_activity_sessions;
create policy "Public can read active published sub activity sessions" on public.event_sub_activity_sessions
for select to anon, authenticated
using (is_active and exists (select 1 from public.events e where e.id=event_id and e.status='published'));
revoke all on public.event_sub_activities from anon, authenticated;
revoke all on public.event_sub_activity_sessions from anon, authenticated;
grant select on public.event_sub_activities to anon, authenticated;
grant select on public.event_sub_activity_sessions to anon, authenticated;
grant all on public.event_sub_activities to service_role;
grant all on public.event_sub_activity_sessions to service_role;

-- Migrate legacy JSON definitions first.
insert into public.event_sub_activities(event_id, legacy_key, name, sort_order, is_active)
select e.id,
       nullif(trim(def->>'id'), ''),
       trim(def->>'name'),
       ordinality::integer - 1,
       true
from public.events e
cross join lateral jsonb_array_elements(coalesce(e.sub_activity_definitions, '[]'::jsonb)) with ordinality as d(def, ordinality)
where (e.sub_activity_mode = true or e.event_mode='sub_activity')
  and nullif(trim(def->>'name'), '') is not null
on conflict (event_id, legacy_key) where legacy_key is not null do update
set name=excluded.name, sort_order=excluded.sort_order, updated_at=now();

-- Also capture legacy named sessions that were not represented in definitions.
insert into public.event_sub_activities(event_id, legacy_key, name, sort_order, is_active)
select s.event_id,
       coalesce(nullif(trim(s.sub_activity_key), ''), md5(s.event_id::text || ':' || lower(trim(s.sub_activity_name)))),
       trim(s.sub_activity_name),
       min(s.sort_order)::integer,
       true
from public.event_sessions s
join public.events e on e.id=s.event_id
where (e.sub_activity_mode=true or e.event_mode='sub_activity')
  and nullif(trim(s.sub_activity_name), '') is not null
group by s.event_id, coalesce(nullif(trim(s.sub_activity_key), ''), md5(s.event_id::text || ':' || lower(trim(s.sub_activity_name)))), trim(s.sub_activity_name)
on conflict (event_id, legacy_key) where legacy_key is not null do nothing;

-- Copy legacy sub-activity sessions into the dedicated table.
insert into public.event_sub_activity_sessions(
  event_id, sub_activity_id, legacy_session_id, session_date, start_at, end_at,
  capacity, confirmed_count, sort_order, is_active, created_at, updated_at
)
select s.event_id, a.id, s.id, s.session_date, s.start_at, s.end_at,
       s.capacity, s.confirmed_count, s.sort_order, s.is_active,
       coalesce(s.created_at, now()), coalesce(s.updated_at, now())
from public.event_sessions s
join public.event_sub_activities a
  on a.event_id=s.event_id
 and a.legacy_key=coalesce(nullif(trim(s.sub_activity_key), ''), md5(s.event_id::text || ':' || lower(trim(s.sub_activity_name))))
where nullif(trim(s.sub_activity_name), '') is not null
on conflict (legacy_session_id) where legacy_session_id is not null do update
set sub_activity_id=excluded.sub_activity_id,
    session_date=excluded.session_date,
    start_at=excluded.start_at,
    end_at=excluded.end_at,
    capacity=excluded.capacity,
    confirmed_count=excluded.confirmed_count,
    sort_order=excluded.sort_order,
    is_active=excluded.is_active,
    updated_at=now();

-- Link existing registration rows to the migrated dedicated records without deleting legacy links.
update public.registrations r
set sub_activity_session_id = sas.id,
    sub_activity_id = sas.sub_activity_id
from public.event_sub_activity_sessions sas
where r.session_id=sas.legacy_session_id
  and r.sub_activity_session_id is null;

-- Reconcile counts in the new dedicated session table.
update public.event_sub_activity_sessions sas
set confirmed_count=(select count(*) from public.registrations r where r.sub_activity_session_id=sas.id and r.status='confirmed');

-- Count synchronization now understands both the ordinary multi-session table and the dedicated sub-activity table.
create or replace function public.sync_event_and_session_counts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  old_confirmed boolean:=false;
  new_confirmed boolean:=false;
  target_session public.event_sessions%rowtype;
  target_sub_session public.event_sub_activity_sessions%rowtype;
begin
  if tg_op <> 'INSERT' then old_confirmed:=old.status='confirmed'; end if;
  if tg_op <> 'DELETE' then new_confirmed:=new.status='confirmed'; end if;

  if tg_op='INSERT' then
    if new_confirmed then
      if new.sub_activity_session_id is not null then
        select * into target_sub_session from public.event_sub_activity_sessions where id=new.sub_activity_session_id and event_id=new.event_id for update;
        if not found then raise exception 'SUB_ACTIVITY_SESSION_NOT_FOUND'; end if;
        if not target_sub_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
        if target_sub_session.confirmed_count >= target_sub_session.capacity then raise exception 'SESSION_FULL'; end if;
        update public.event_sub_activity_sessions set confirmed_count=confirmed_count+1 where id=new.sub_activity_session_id;
      elsif new.session_id is not null then
        select * into target_session from public.event_sessions where id=new.session_id and event_id=new.event_id for update;
        if not found then raise exception 'SESSION_NOT_FOUND'; end if;
        if not target_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
        if target_session.confirmed_count >= target_session.capacity then raise exception 'SESSION_FULL'; end if;
        update public.event_sessions set confirmed_count=confirmed_count+1 where id=new.session_id;
      end if;
      update public.events set confirmed_count=confirmed_count+1 where id=new.event_id;
    end if;
    return new;
  elsif tg_op='DELETE' then
    if old_confirmed then
      if old.sub_activity_session_id is not null then
        update public.event_sub_activity_sessions set confirmed_count=greatest(0,confirmed_count-1) where id=old.sub_activity_session_id;
      elsif old.session_id is not null then
        update public.event_sessions set confirmed_count=greatest(0,confirmed_count-1) where id=old.session_id;
      end if;
      update public.events set confirmed_count=greatest(0,confirmed_count-1) where id=old.event_id;
    end if;
    return old;
  end if;

  if old_confirmed and (not new_confirmed or old.event_id<>new.event_id or old.session_id is distinct from new.session_id or old.sub_activity_session_id is distinct from new.sub_activity_session_id) then
    if old.sub_activity_session_id is not null then
      update public.event_sub_activity_sessions set confirmed_count=greatest(0,confirmed_count-1) where id=old.sub_activity_session_id;
    elsif old.session_id is not null then
      update public.event_sessions set confirmed_count=greatest(0,confirmed_count-1) where id=old.session_id;
    end if;
    update public.events set confirmed_count=greatest(0,confirmed_count-1) where id=old.event_id;
  end if;

  if new_confirmed and (not old_confirmed or old.event_id<>new.event_id or old.session_id is distinct from new.session_id or old.sub_activity_session_id is distinct from new.sub_activity_session_id) then
    if new.sub_activity_session_id is not null then
      select * into target_sub_session from public.event_sub_activity_sessions where id=new.sub_activity_session_id and event_id=new.event_id for update;
      if not found then raise exception 'SUB_ACTIVITY_SESSION_NOT_FOUND'; end if;
      if not target_sub_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
      if target_sub_session.confirmed_count >= target_sub_session.capacity then raise exception 'SESSION_FULL'; end if;
      update public.event_sub_activity_sessions set confirmed_count=confirmed_count+1 where id=new.sub_activity_session_id;
    elsif new.session_id is not null then
      select * into target_session from public.event_sessions where id=new.session_id and event_id=new.event_id for update;
      if not found then raise exception 'SESSION_NOT_FOUND'; end if;
      if not target_session.is_active then raise exception 'SESSION_NOT_ACTIVE'; end if;
      if target_session.confirmed_count >= target_session.capacity then raise exception 'SESSION_FULL'; end if;
      update public.event_sessions set confirmed_count=confirmed_count+1 where id=new.session_id;
    end if;
    update public.events set confirmed_count=confirmed_count+1 where id=new.event_id;
  end if;
  return new;
end; $$;

drop trigger if exists registrations_sync_confirmed_count on public.registrations;
create trigger registrations_sync_confirmed_count
before insert or update of status,event_id,session_id,sub_activity_session_id or delete on public.registrations
for each row execute function public.sync_event_and_session_counts();

-- Transactional replacement of the complete dedicated sub-activity tree.
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
    is_active boolean not null
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

  insert into sub_activity_plan(id,name,sort_order,is_active)
  select (x.item->>'id')::uuid, trim(x.item->>'name'), x.ord::integer-1,
         coalesce((x.item->>'is_active')::boolean,true)
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

  insert into public.event_sub_activities(id,event_id,name,sort_order,is_active,updated_at)
  select id,p_event_id,name,sort_order,is_active,now() from sub_activity_plan
  on conflict(id) do update set name=excluded.name,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();

  insert into public.event_sub_activity_sessions(id,event_id,sub_activity_id,session_date,start_at,end_at,capacity,sort_order,is_active,updated_at)
  select id,p_event_id,sub_activity_id,session_date,start_at,end_at,capacity,sort_order,is_active,now()
  from sub_activity_session_plan
  on conflict(id) do update set sub_activity_id=excluded.sub_activity_id,session_date=excluded.session_date,start_at=excluded.start_at,end_at=excluded.end_at,capacity=excluded.capacity,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();

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

-- Dedicated public registration RPC for sub-activity mode.
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

  perform 1 from public.event_sub_activity_sessions s
   where s.event_id=p_event_id and s.id=any(p_session_ids) for update;
  if (select count(*) from public.event_sub_activity_sessions s where s.event_id=p_event_id and s.id=any(p_session_ids))<>selected_count then raise exception 'SESSION_NOT_FOUND'; end if;
  if exists(select 1 from public.event_sub_activity_sessions s where s.id=any(p_session_ids) and (not s.is_active or s.start_at<=now())) then raise exception 'SESSION_NOT_ACTIVE'; end if;
  select count(distinct sub_activity_id) into distinct_activities from public.event_sub_activity_sessions where id=any(p_session_ids);
  if distinct_activities<>selected_count then raise exception 'ONE_SESSION_PER_SUB_ACTIVITY'; end if;
  if exists(
    select 1 from public.event_sub_activity_sessions a
    join public.event_sub_activity_sessions b on a.id<b.id
    where a.id=any(p_session_ids) and b.id=any(p_session_ids)
      and a.start_at<b.end_at and b.start_at<a.end_at
  ) then raise exception 'SESSION_TIME_CONFLICT'; end if;

  if exists(
    select 1
    from public.registrations r
    join public.event_sub_activity_sessions old_s on old_s.id=r.sub_activity_session_id
    join public.event_sub_activity_sessions new_s on new_s.id=any(p_session_ids)
    where r.event_id=p_event_id and r.status in ('confirmed','waitlist')
      and ((normalized_email is not null and lower(r.email)=normalized_email) or trim(r.phone)=normalized_phone)
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

comment on column public.events.event_mode is 'Independent event builder mode: single, multi_session, sub_activity, or external.';
