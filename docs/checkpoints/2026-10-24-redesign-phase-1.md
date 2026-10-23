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

See the end of this file for the local and hosted results recorded before pushing.
