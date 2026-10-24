-- The legacy single-event email uniqueness rule must not treat V2 sub-activity registrations
-- (which intentionally keep session_id NULL) as ordinary single-event registrations.
drop index if exists public.one_active_registration_per_email_single_event;
create unique index one_active_registration_per_email_single_event
  on public.registrations(event_id, lower(email))
  where email is not null
    and session_id is null
    and sub_activity_session_id is null
    and status in ('confirmed','waitlist');
