alter table public.events
  add column if not exists registration_visibility text not null default 'public',
  add column if not exists invite_code_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_registration_visibility_check'
  ) then
    alter table public.events
      add constraint events_registration_visibility_check
      check (registration_visibility in ('public', 'private'));
  end if;
end $$;

update public.events
set registration_visibility = 'public'
where registration_visibility is null or registration_visibility not in ('public', 'private');
