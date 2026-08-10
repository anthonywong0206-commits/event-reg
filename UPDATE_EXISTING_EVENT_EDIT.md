# Existing event edit enhancement (2026-08-10)

- Existing events can continue to edit all existing event fields from the same edit screen.
- Capacity controls now explicitly support increasing capacity and enforce a minimum equal to the current confirmed count.
- Multi-session capacity controls show confirmed counts per session and allow increasing each session capacity.
- Waitlist setting is editable at any time for an existing event.
- No database migration is required for this UI/API refinement; it uses the existing `accepts_waitlist` field.
