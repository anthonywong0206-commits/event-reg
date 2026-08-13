# Safe multi-session activity updates

This update changes multi-session editing from row-by-row API updates to a transactional Supabase RPC.

Key behaviour:
- Existing session start times are moved to temporary timestamps inside one database transaction before final values are written, preventing unique(event_id, start_at) collisions when times are swapped or reused.
- Session capacity cannot be reduced below confirmed registrations.
- A session referenced by any registration record cannot be deleted accidentally.
- Duplicate final start times are rejected with a clear admin-facing error.
- Any RPC failure rolls back the entire session update automatically.

Database migration:
- `202608130002_safe_multi_session_updates.sql`
