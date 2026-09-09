alter table public.events
  add column if not exists external_registration boolean not null default false,
  add column if not exists external_registration_url text,
  add column if not exists external_registration_organization text;

alter table public.events
  drop constraint if exists events_external_registration_fields_check;

alter table public.events
  add constraint events_external_registration_fields_check
  check (
    external_registration = false
    or (
      external_registration_url is not null
      and length(trim(external_registration_url)) > 0
      and external_registration_organization is not null
      and length(trim(external_registration_organization)) > 0
    )
  );
