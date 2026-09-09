# External registration update

Added external-link registration for events.

- Admin can enable external registration and set organization + URL.
- Public event page shows an "外部連結報名" button.
- A confirmation modal warns the user before leaving the website.
- External-registration events hide participant counts / remaining-seat counts on public pages.
- Internal registration API rejects submissions for external-registration events.
- External registration still follows the configured registration start/deadline window.
- Existing events remain internal registration by default.

Database migration: `202609090001_add_external_registration.sql`.
