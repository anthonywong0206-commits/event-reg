# Sub-activity persistence fix

- Sub-activities are now stored independently in `events.sub_activity_definitions`.
- Each child activity has a stable ID; sessions link through `event_sessions.sub_activity_key`.
- A child activity can be saved as part of a draft even before any session is created.
- Renaming a child activity no longer breaks its existing session relationship.
- Reopening the event editor restores child activities even when a child activity currently has no session.
- Existing name-based child activities are backfilled automatically by migration.
- Published/cancelled multi-session events still require at least one session; drafts may be saved first and completed later.
