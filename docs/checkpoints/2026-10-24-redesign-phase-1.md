# UI redesign, phase 1: app shell, landing page, onboarding — October 24, 2026

Parent: `9cd69fd`. The owner approved a written proposal (recorded in `docs/ui-redesign.md`): a marketing landing page for visitors, a focused workspace for members, one page per tool, a GitHub-style settings map, and a phone bottom bar. This phase delivers the shell.

## Changes

- **Two worlds.** `/` is a landing page: hero, three-step "how it works", a clickable feature tour with animated CSS/SVG product mock-ups, a recruiter section, trust points, and a final call to action. Visitors see only **Log in** and **Get started** in the header. Signed-in members are redirected from `/` to `/home`.
- **App shell (signed in).** Header: Home · Projects · Code · Collab · Opportunities · Talent · Skills, a search box, the notification bell and a profile-picture menu (Your profile, Bookmarks, Settings, theme, Sign out). No dropdown menus hide features. Phones get a bottom tab bar (Home, Projects, Code, Jobs, Profile) with safe-area padding.
- **Home feed (`/home`).** Three columns: your card with a profile-strength checklist (handle and photo, skills, GitHub connected, a skill check taken), the feed in the middle, and "Next for you" shortcuts.
- **Onboarding (`/welcome`).** Four skippable steps after sign-up: who you are (name, Developer/Recruiter), profile (photo, handle, headline), skills, connect GitHub. Each step saves on its own; finishing or skipping sets `profiles.onboarded_at`. `OnboardingGate` sends members there once, after the terms step.
- **Profile fields.** Migration `0018`: `profiles.headline`, `profiles.links` (website, GitHub, LinkedIn), `profiles.visibility` (`public` | `members`, enforced in phase 2), `profiles.onboarded_at` (backfilled for members who already have a handle). `profile-save` accepts `headline` and `links`; people records return them; `AccountUser.onboardingRequired` tells the client.
- **Code.** `/code` hosts the editor; `/editor` redirects there. The GitHub connect flow accepts `returnTo` (`code` or `welcome`) in a second `__Host-` cookie so the wizard gets the member back.
- **Removed (approved).** The standalone Writing assist page (`/assist`); the inline assist in forms stays. "Build log" is now the Feed.

## Validation

- Unit: 780 passed. Embedded PostgreSQL: 222 passed, 2 skipped. Typecheck, lint and the format check pass.
- Pages rendered in Cloudflare's runtime (workerd): `/`, `/home`, `/welcome`, `/code`, `/editor`, `/privacy`, `/sitemap.xml`, `/og.png` return 200; the removed `/assist` returns 404. Build files carry `max-age=31536000, immutable`. Worker: 1,941 of 3,072 KiB.
- Hosted CI and Security passed on `7f6c7e1`, after two dependency advisories were fixed on the way (`zod` 4.6.6 with v3-style code importing `zod/v3`, `body-parser` 2.4.0) and the generated zod client was switched to zod 4 syntax.
- Migration `0018` applied to Neon staging (19 migrations, 53 tables). **Production is pending the owner's approval**, and Render must then be redeployed: until both happen, the new website sends `headline`/`links` fields the old API rejects, so profile saves and the wizard fail on the live site.
- Live: the landing page and `/home`, `/welcome`, `/code` are served by Cloudflare; `/assist` is 404.
