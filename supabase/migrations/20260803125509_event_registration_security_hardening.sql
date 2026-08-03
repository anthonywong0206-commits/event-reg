-- Remove privileges inherited from this project's legacy public-schema defaults.
-- RLS remains enabled, but the Data API should expose only the operations used by
-- the event registration application.
revoke all on public.events, public.registrations, public.admin_profiles from anon, authenticated;

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, update on public.registrations to authenticated;
grant select on public.admin_profiles to authenticated;
grant all on public.events, public.registrations, public.admin_profiles to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.sync_confirmed_count() from public, anon, authenticated;

-- The registration transaction remains callable only by trusted server code.
revoke all on function public.register_for_event(
  uuid, text, text, text, public.registration_method, text
) from public, anon, authenticated;
grant execute on function public.register_for_event(
  uuid, text, text, text, public.registration_method, text
) to service_role;
