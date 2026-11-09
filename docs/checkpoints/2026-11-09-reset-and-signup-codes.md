# Password reset and sign-up confirmation — November 9, 2026

Parent: `a20f9bd`. Owner report: registration emails do not arrive and password reset does not work well.

## Causes

1. **Emails not arriving (configuration, not code):** Supabase's built-in email service delivers only to members of the Supabase project's team and about two emails an hour. Public sign-up and reset emails need custom SMTP (Resend with a verified domain, or Gmail SMTP with an app password as a stop-gap). The Supabase URL configuration must also allow `<site>/api/auth/callback`.
2. **Reset links worked only in the requesting browser:** links use PKCE with a verifier kept in that browser's flow cookie; opened on another device they fail.
3. **A working reset link led nowhere:** it signed the member in with a short recovery session and sent them to the home page, with no prompt to choose a password.
4. **No place for the email's code** after sign-up or reset, although the API supported codes for sign-up.

## Changes

- After sign-up or a reset request the form shows a code box ("Confirm your email" / "Check your email", with spam-folder advice); the email's link remains an alternative.
- `verify-otp` accepts reset codes (Supabase type `recovery`) and creates the ten-minute recovery session.
- Reset links and codes end on **`/auth/new-password`**: new password twice, then every device is signed out and the member logs in again. An expired reset, or one opened elsewhere, explains itself and offers a new reset email. `/auth?mode=reset` opens the reset form.
- `/auth/context` reports `passwordRecovery`, so the sign-in page sends recovery sessions to the new-password page instead of the home page.
- Codes appear in emails only once the Supabase email templates include `{{ .Token }}`; Supabase allows template edits once custom SMTP is configured.

## Validation

- Unit: 825 passed (`tests/auth-social-providers.test.ts`: a reset returns a code handle bound to the browser's flow cookie, and the code is verified as `recovery`). Embedded PostgreSQL: 227 passed, 2 skipped.
- Typecheck, lint, format check; generated client matches; the built API starts. Pages rendered in Cloudflare's runtime: `/auth`, `/auth?mode=reset`, `/auth/new-password`. Hosted CI and Security passed on `f573d0f`.
- **Owner:** deploy `f573d0f` (or later) on Render; configure custom SMTP and the templates.
