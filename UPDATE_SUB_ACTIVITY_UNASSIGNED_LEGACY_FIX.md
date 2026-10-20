# Sub-activity legacy-session compatibility fix

- Existing multi-session rows without a valid sub-activity key no longer block saving an event after sub-activity mode is enabled.
- Legacy/unassigned sessions are preserved rather than deleted when switching to sub-activity mode.
- Admin editor shows an "未分配舊時段" section and allows each old session to be assigned to an existing sub-activity.
- New sessions are still required to belong to a valid sub-activity, preventing new orphan sessions.
- Existing sessions with stale/missing legacy linkage can be saved unchanged until the administrator assigns them.
- No database migration is required for this fix.
