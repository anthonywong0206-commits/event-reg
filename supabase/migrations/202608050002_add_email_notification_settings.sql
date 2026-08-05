-- Configurable registration confirmation email and QR-code notification settings.
create table if not exists public.event_email_notification_settings (
  setting_key text primary key default 'registration_confirmation',
  enabled boolean not null default true,
  template_key text not null default 'standard'
    check (template_key in ('standard', 'friendly', 'concise', 'custom')),
  subject_template text not null default '報名成功｜{{event_title}}',
  body_template text not null default E'{{name}} 您好：\n\n感謝您報名「{{event_title}}」。您的報名已確認。\n\n活動日期及時間：{{event_date}}\n活動地點：{{event_location}}\n報名編號：{{registration_no}}\n\n請保存本電郵及下方 QR Code，並於活動當日出示以完成出席登記。',
  include_qr boolean not null default true,
  reply_to text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_email_settings_singleton check (setting_key = 'registration_confirmation')
);

insert into public.event_email_notification_settings (setting_key)
values ('registration_confirmation')
on conflict (setting_key) do nothing;

alter table public.event_email_notification_settings enable row level security;

revoke all on table public.event_email_notification_settings from anon, authenticated;
grant select, insert, update, delete on table public.event_email_notification_settings to service_role;

drop policy if exists "No client access to event email settings" on public.event_email_notification_settings;
create policy "No client access to event email settings"
on public.event_email_notification_settings
for all to anon, authenticated
using (false)
with check (false);

drop trigger if exists event_email_settings_set_updated_at
  on public.event_email_notification_settings;
create trigger event_email_settings_set_updated_at
before update on public.event_email_notification_settings
for each row execute function public.set_updated_at();
