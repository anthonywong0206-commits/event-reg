alter table public.event_site_settings
  add column if not exists hero_button_enabled boolean not null default false,
  add column if not exists hero_button_label text not null default '立即報名',
  add column if not exists hero_button_position text not null default 'center',
  add column if not exists hero_button_link_type text not null default 'event',
  add column if not exists hero_button_event_slug text,
  add column if not exists hero_button_external_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_site_settings_hero_button_position_check'
  ) then
    alter table public.event_site_settings
      add constraint event_site_settings_hero_button_position_check
      check (hero_button_position in ('left', 'center', 'right'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_site_settings_hero_button_link_type_check'
  ) then
    alter table public.event_site_settings
      add constraint event_site_settings_hero_button_link_type_check
      check (hero_button_link_type in ('event', 'external'));
  end if;
end $$;

update public.event_site_settings
set
  hero_button_enabled = coalesce(hero_button_enabled, false),
  hero_button_label = coalesce(nullif(trim(hero_button_label), ''), '立即報名'),
  hero_button_position = coalesce(nullif(trim(hero_button_position), ''), 'center'),
  hero_button_link_type = coalesce(nullif(trim(hero_button_link_type), ''), 'event')
where setting_key = 'homepage';
