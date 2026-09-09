# Participant list Excel export

- Replaced CSV export with formatted `.xlsx` participant list export.
- Workbook header contains event title, date and time.
- Export columns: sequential registration number, participant name, phone, notes and sign-in.
- Registration number is regenerated from confirmed participant registration order (1..N for the whole event).
- Removed email, registration method, status, submitted time and attended time from the export.
- Multi-date events use one worksheet per date.
- Multiple sessions on the same date remain on the same worksheet and are separated by session headings.
- Only confirmed participants are included in the sign-in list; waitlist/cancelled registrations are not mixed into the participant list.
