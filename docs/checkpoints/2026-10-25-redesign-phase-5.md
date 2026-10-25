# UI redesign, phase 5: phone bar, keyboard, empty states — October 25, 2026

Parent: `b59fb25`. Closes the redesign plan in `docs/ui-redesign.md`.

## Changes

- **Phone bottom bar:** a tab is current for its whole section (an application thread lights up Jobs, a repository lights up Code), not only for its own prefix. The code editor is shorter on phones so its status bar is not hidden behind the bar.
- **Keyboard:** every `role="tablist"` (landing feature tour, repository Source/Preview, open files in the editor) now follows the native pattern: only the selected tab is in the Tab order, Arrow keys move between tabs and wrap, Home/End jump, and focus follows the selection (`lib/a11y.ts`). The skip link, focus rings and header labels from phase 1 were checked and kept.
- **Alt text:** audited every image. Avatars are decorative (`alt=""`, the name is adjacent); project cards likewise; project screenshots carry the project title; the authenticator QR code is labelled. No change was needed.
- **Empty states, job alerts (approved addition):** a new opt-in notification category **"New opportunities for your skills"** (email only, **off by default**). The Opportunities _Browse_ and _Suggested for you_ empty states offer **Email me when roles match my skills** (signed out: "Create a free account to get alerts"); it stores the preference and says plainly that emails start once email delivery exists. The category also appears in Settings → Notifications, whose table now scrolls sideways on narrow screens instead of overflowing.
- **Partial preference saves:** `notification-preferences-save` accepts a subset of categories and keeps the stored values for the rest.

## Validation

- Unit: 812 passed (`tests/a11y.test.ts` covers the tablist key handling). Embedded PostgreSQL: `tests/settings.integration.test.ts` now checks the opt-in default and the partial save.
- Typecheck, lint and the format check pass. The built API starts and answers `/api/healthz`.
- Embedded PostgreSQL: 226 passed, 2 skipped. Pages rendered in Cloudflare's runtime: `/`, `/opportunities`, `/opportunities/suggested`, `/code`, `/settings/notifications`, `/repositories`, `/home`. Hosted CI and Security passed on `488ec2e` (the first push, `d9a767a`, failed lint on a Prettier line break in `lib/a11y.ts`; fixed). The live site serves the build.
- **Pending the owner:** Render deploy of `488ec2e` so the live API accepts the new notification category and partial preference saves (until then the job-alert button reports a validation error).
