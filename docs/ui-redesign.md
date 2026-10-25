# UI/UX redesign (approved October 24, 2026)

The owner approved this design before implementation. Changes to it, including any further removal or addition, need the owner's agreement first.

## Principles

1. **Two products, one brand.** Signed out, the site is a landing page whose only job is to explain and convert (Log in, Get started). Signed in, it is a workspace.
2. **One page per job.** Each tool has its own page with a working area. No dropdown menus hide features.
3. **Settings as a map of the account**, in the GitHub style: a left list of topics, each a plain form.
4. **Fewer, clearer actions.** Buttons say what happens; destructive actions are separate and confirmed.
5. **Progress visible.** New members see what to do next.

## Structure

| Signed out      | Signed in                                            |
| --------------- | ---------------------------------------------------- |
| `/` landing     | `/home` feed with a profile-strength checklist       |
| `/auth`         | `/projects`, `/code`, `/organizations` (Collab)      |
| `/about`, legal | `/opportunities`, `/talent`, `/assessments` (Skills) |
|                 | `/search`, `/notifications`, `/profile/<handle>`     |
|                 | `/welcome` wizard, `/settings/*` (phase 2)           |

Header (signed in): Home · Projects · Code · Collab · Opportunities · Talent · Skills · search · bell · profile-picture menu (Your profile, Bookmarks, Settings, theme, Sign out). Phones: bottom tab bar (Home, Projects, Code, Jobs, Profile).

## Settings map (phase 2)

Profile · Account · Security · Notifications · Career · Connections · Organizations · Privacy & data · Appearance · Administration (platform roles only). Replaces `/account`, `/profile/settings` and the career preferences inside `/career`.

## Approved removals

- Writing assist page (inline assist in forms stays).
- Intelligence workspace as a menu item: learning plans move under Skills, repository security review under Code, skill matches become Opportunities suggestions.
- Bookmarks out of the main menu (profile menu and feed filter).
- Hosted "Initialize a repository" hidden until repository hosting exists.
- Approved October 24 for phase 4: the `/community` duplicate of the feed, the `/career` page, the `/intelligence` workspace page (results keep their URLs) and the "Usage today" card; all old addresses redirect.

## Approved additions

- Onboarding wizard after sign-up (skippable steps).
- Profile headline and links (website, GitHub, LinkedIn).
- GitHub fork, branch and pull-request actions through the GitHub connection.
- Notification preferences (in-app and email per event) and profile visibility (public or members only).
- Job-alert call to action in empty states (active once email delivery exists).
- Approved October 24 for phase 4: opportunity type filter, talent availability and skill filters, a Hiring section for organization managers, an inline share box on the feed.

## Phases

1. App shell, landing page, onboarding. _(done: see `checkpoints/2026-10-24-redesign-phase-1.md`)_
2. Settings. _(done: see `checkpoints/2026-10-24-redesign-phase-2.md`)_
3. Code hub: GitHub clone, fork, branch, pull request. _(done: see `checkpoints/2026-10-24-redesign-phase-3.md`)_
4. Page layouts: feed, projects, opportunities, talent, skills. _(done: see `checkpoints/2026-10-25-redesign-phase-4.md`)_
5. Phone bottom bar polish, keyboard accessibility, alt text, empty states. _(done: see `checkpoints/2026-10-25-redesign-phase-5.md`)_

Each phase is checked the same way: typecheck, lint, unit and database tests, pages rendered in Cloudflare's runtime, push, hosted CI, live check.
