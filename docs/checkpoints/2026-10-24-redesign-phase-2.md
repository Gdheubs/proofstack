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

See the end of this file.
