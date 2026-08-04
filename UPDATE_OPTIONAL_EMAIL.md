# Participant email is now optional

This update makes the participant email address optional in both public registration and administrator participant management.

## Behaviour

- Participants may submit a registration without an email address.
- The QR admission credential remains available on the registration success page.
- Confirmation email is only sent when an email address is provided.
- Administrators may add or edit participants without an email address.
- Administrators cannot select “send confirmation email” unless an email address is supplied.
- Duplicate-email protection still applies whenever an email address is provided.
- CSV exports leave the email column blank when no address was supplied.

## Database

Existing deployments must apply:

`supabase/migrations/202608040004_make_registration_email_optional.sql`
