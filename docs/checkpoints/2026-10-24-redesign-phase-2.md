# UI redesign, phase 2: Settings — October 24, 2026

Parent: `5cfdd29`. Delivers the settings map from `docs/ui-redesign.md`.

## Changes

- **`/settings`** with a left list of sections and one plain form per section:
  - **Profile:** photo, name, handle, **headline**, bio, location, skills, **links** (website, GitHub, LinkedIn), profile type. Same form as before, now with the phase-1 fields.
  - **Account:** email with a **change-email** flow (new `update-email` auth action: the provider confirms with both addresses), phone verification, and a pointer to deletion.
  - **Security:** password, two-step verification, backup codes, devices, security activity.
  - **Notifications:** per-category in-app and email switches (replies/mentions/reactions, followers, invitations, applications). Stored in `users.notification_prefs` (migration `0019`); `notify()` now skips in-app notices a member has turned off. Security notices are never optional. Email switches are saved for when email delivery exists.
  - **Career:** availability, roles, discoverable, featured projects (the form moved here from `/career`, which now links to it).
  - **Connections:** GitHub connect and disconnect (the connect flow can return to settings).
  - **Organizations:** memberships, create an organization, grant roles.
  - **Privacy & data:** **profile visibility** (public, or members only), download my data, delete account. Members-only profiles are hidden from signed-out visitors in the profile page, search, the talent directory and skill-check results.
  - **Appearance:** light, dark or match device.
  - **Administration** (platform roles only): links to accounts and operations.
- **Old addresses redirect:** `/account` → `/settings/account`, `/profile/settings` → `/settings/profile`. `/account/admin` and `/account/operations` stay. The profile menu's Settings entry and every in-app link now point at `/settings`.
- Search engines are told not to index `/settings`, `/welcome` and `/code`.

## Validation

- Unit: 799 passed. Embedded PostgreSQL: 225 passed, 2 skipped, including `tests/settings.integration.test.ts` (per-category switches saved and honoured by `notify()`, security notices unaffected; a members-only profile hidden from signed-out visitors in the profile page, search, talent directory and skill-check results while members still see it; email-change input validation).
- Typecheck, lint and the format check pass. The built API starts and answers `/api/healthz` (CI bundle check). Pages rendered in Cloudflare's runtime: `/settings`, `/settings/profile`, `/settings/notifications`, `/settings/privacy`, and the redirects `/account` and `/profile/settings`. Worker: 1,962 of 3,072 KiB.
- Hosted CI and Security passed on `8e07cb8`; the live site serves the settings pages.
- Migration `0019` applied to Neon staging (20 migrations). **Production migration and the Render deploy are pending the owner**; until then notification preferences, email change and profile visibility fail on the live API.
