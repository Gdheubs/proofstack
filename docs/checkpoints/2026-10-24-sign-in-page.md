# Sign-in page: one form, no method tabs — October 24, 2026

Parent: `ace1b79`. Owner feedback on the live `/auth` page: the "Password / Email code" tab bar above the form served no purpose.

## Changes

- `/auth` renders one form. `?mode=signup` ("Get started" links) opens **Create your account**; otherwise **Welcome back**. The old tab bar and the inner "Sign in / Create account / Forgot password" button row are gone.
- **Forgot password?** sits under the password field; the bottom of the form switches between Log in and Create account.
- Social buttons appear above the form only when a provider is enabled (none are today). The email code (and phone code, when enabled) is reached from a small "Email me a one-time code instead" link, with a way back to the password form.
- Left column copy now matches the landing page ("Build something. Let it open doors.").

## Validation

- Unit: 799 passed (`pnpm test`). Typecheck, lint and Prettier pass.
- Rendered in Cloudflare's runtime: `/`, `/auth`, `/auth?mode=signup`, `/home`, `/settings`, `/privacy` all 200; the page no longer contains the "Email code" tab text.
- Hosted CI and Security passed on `634d771`; the live site serves the new page.
- No API or database change; the Render deploy of the phase 1+2 API (`ace1b79` or later) is still pending the owner.

## Live pass (owner, October 24, 2026)

After the Render deploy of the phase 1+2 API, the owner ran the signed-in pass on the live site with a new account: landing → Create your account (no tab bar) → confirmation email → sign-in → `/welcome` wizard → `/home`; headline and links saved on `/settings/profile`; a notification category switched off and kept; members-only visibility hides the profile from a signed-out window while the member still sees it; the email-change flow sends to both addresses; sign-out returns to the landing page. Every step passed.
