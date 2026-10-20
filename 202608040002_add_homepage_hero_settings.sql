-- Add independently managed homepage hero text and banner image.

create table if not exists public.event_site_settings (
  setting_key text primary key default 'homepage',
  hero_title text not null default E'連結人與活動\n創造更多可能',
  hero_description text not null default '發掘精彩活動、學習新知、參與社群。從活動海報到電子入場證，讓每一次參與都更簡單。',
  hero_image_url text not null default '/images/hero-community.jpg',
  hero_image_alt text not null default '明亮的社區活動空間',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_settings_singleton check (setting_key = 'homepage'),
  constraint hero_title_length check (char_length(hero_title) between 2 and 240),
  constraint hero_description_length check (char_length(hero_description) between 2 and 800),
  constraint hero_image_url_length check (char_length(hero_image_url) between 1 and 1000),
  constraint hero_image_alt_length check (char_length(hero_image_alt) between 1 and 240)
);

create index if not exists event_site_settings_updated_by_idx
  on public.event_site_settings(updated_by);

insert into public.event_site_settings (
  setting_key,
  hero_title,
  hero_description,
  hero_image_url,
  hero_image_alt
) values (
  'homepage',
  E'連結人與活動\n創造更多可能',
  '發掘精彩活動、學習新知、參與社群。從活動海報到電子入場證，讓每一次參與都更簡單。',
  '/images/hero-community.jpg',
  '明亮的社區活動空間'
)
on conflict (setting_key) do nothing;

-- The initial migration defines this shared timestamp trigger function.
drop trigger if exists event_site_settings_set_updated_at on public.event_site_settings;
create trigger event_site_settings_set_updated_at
before update on public.event_site_settings
for each row execute function public.set_updated_at();

alter table public.event_site_settings enable row level security;

drop policy if exists "Public can read homepage settings" on public.event_site_settings;
create policy "Public can read homepage settings" on public.event_site_settings
for select to anon, authenticated
using (setting_key = 'homepage');

-- Writes are intentionally performed only by the validated server-side admin API.
revoke all on public.event_site_settings from public, anon, authenticated;
grant select on public.event_site_settings to anon, authenticated;
grant all on public.event_site_settings to service_role;
