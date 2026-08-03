-- Allow authenticated administrators to create and remove registrations.
-- Updates and reads are covered by the policies from the initial schema.

grant insert, delete on table public.registrations to authenticated;

drop policy if exists "Admins can insert registrations" on public.registrations;
create policy "Admins can insert registrations"
on public.registrations
for insert
to authenticated
with check ((select private.is_admin()));

drop policy if exists "Admins can delete registrations" on public.registrations;
create policy "Admins can delete registrations"
on public.registrations
for delete
to authenticated
using ((select private.is_admin()));
