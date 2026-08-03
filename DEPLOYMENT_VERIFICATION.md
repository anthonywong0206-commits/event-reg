# Deployment Verification

Last verified: 2026-08-03 (Asia/Shanghai)

## Scope and source

- Repository: `anthonywong0206-commits/event-reg`
- Vercel project: `anthonywong-s-projects/event-reg`
- Supabase project: `anthonywong0206-commits's Project`
- Supabase project ref: `jciqwdzuptvmwdmmqdaj` (`ap-southeast-2`, healthy)
- The requested `CODEX_SUPABASE_HANDOFF.md` was not present in the checkout or any remote branch at takeover time. Work was completed against the repository schema, README, application code, and the explicit acceptance checklist.

No secret value or administrator password is stored in this document, source code, or Git.

## Database and migrations

Applied and verified in order:

1. `202608030001_initial_schema.sql`
2. `20260803125509_event_registration_security_hardening.sql`
3. `20260803125824_event_registration_advisor_fixes.sql`
4. `20260803141000_event_policy_consolidation.sql`
5. `supabase/seed.sql`

Verified outcomes:

- `events`, `registrations`, and `admin_profiles` exist with RLS enabled.
- Anonymous users can read only published events and cannot read registrations or admin profiles.
- Ordinary authenticated users cannot access the back office or protected registration data.
- Event-management policies are limited to users in `admin_profiles`.
- `register_for_event` can be executed only by `service_role` and performs the capacity check, duplicate-email check, insert, and counter update in one locked transaction.
- The `event-media` bucket is public for object delivery, limited to JPEG/PNG/WebP and 8 MB; anonymous listing/upload is not permitted.
- Supabase security advisors report no findings for the event-registration objects after hardening. Performance advisors only report the expected unused indexes on this newly exercised dataset; the duplicate permissive SELECT-policy warning was removed by the policy-consolidation migration.

## Authentication and authorization

- The first administrator exists in Supabase Auth, is email-confirmed, has `app_metadata.role=admin`, and has a matching `admin_profiles` row.
- `/admin/login` succeeds for that administrator.
- A temporary ordinary Auth user was able to authenticate with Supabase but received HTTP 403 from the application admin login route; it was deleted after the test.
- Unauthenticated check-in returns HTTP 401.

## Registration and capacity tests

- Real browser form submission created a Supabase registration row and rendered the QR success page.
- `confirmed_count` moved from 0 to 1 and matched the registration count.
- Case-insensitive duplicate email was rejected.
- A different email was rejected when capacity was full.
- A new registration was rejected after the registration deadline.
- Two concurrent attempts for the final place produced one success and one `EVENT_FULL`; the event remained at 1/1.

## QR, check-in, Storage, and export tests

- Success page rendered a QR Code and download link.
- First authenticated check-in populated `attended_at` and displayed `登記成功`.
- Repeating the same scan did not update attendance again and displayed `此憑證已登記`.
- A real JPEG upload reached `event-media`, returned a public Storage URL, served HTTP 200 as `image/jpeg`, and was saved through the event editor.
- Authenticated CSV export returned HTTP 200, UTF-8 BOM, attachment headers, the expected header row, and the real registration row.

## Browser and build verification

- Desktop viewport: home, event detail, registration, admin dashboard, image editor, registration list/CSV, and QR check-in verified.
- Mobile viewport (390 × 844): the same primary routes verified with no document-level horizontal overflow. The registration table remains intentionally scrollable inside its constrained container.
- Browser console: clean after fixing countdown hydration.
- `npm run typecheck`: pass.
- `npm run build`: pass.

## Vercel environment behavior

- Public Supabase variables and `DEMO_MODE=false` are configured for Development, Preview, and Production.
- `SUPABASE_SERVICE_ROLE_KEY` is Sensitive for Preview and Production. Vercel does not support Sensitive variables in Development, so local development uses a gitignored environment file or process injection.
- Preview QR URLs prefer `VERCEL_URL`; Production QR URLs use the canonical `NEXT_PUBLIC_APP_URL`.
- Canonical Production URL: `https://event-reg-rouge.vercel.app`.

## External credential blocker

The only remaining external credential is Resend: a Resend API key plus a verified sender domain/address. Until supplied, registration remains successful and the QR success page remains available; `email_sent=false` and the provider configuration error are recorded for follow-up.
