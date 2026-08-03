-- Consolidate authenticated event SELECT access into one policy. This retains
-- public published-event visibility while avoiding multiple permissive SELECT
-- policies for authenticated administrators.
drop policy if exists "Public can read published events" on public.events;
drop policy if exists "Admins can manage events" on public.events;
drop policy if exists "Authenticated can read accessible events" on public.events;
drop policy if exists "Admins can create events" on public.events;
drop policy if exists "Admins can update events" on public.events;
drop policy if exists "Admins can delete events" on public.events;

create policy "Public can read published events" on public.events
for select to anon
using (status = 'published');

create policy "Authenticated can read accessible events" on public.events
for select to authenticated
using (status = 'published' or (select private.is_admin()));

create policy "Admins can create events" on public.events
for insert to authenticated
with check ((select private.is_admin()));

create policy "Admins can update events" on public.events
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete events" on public.events
for delete to authenticated
using ((select private.is_admin()));
