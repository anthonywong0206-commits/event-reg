create index if not exists events_created_by_idx on public.events(created_by);

-- Public object URLs are served by the public bucket without a SELECT policy.
-- Removing the broad policy prevents anonymous clients from listing the bucket.
drop policy if exists "Public can view event media" on storage.objects;
