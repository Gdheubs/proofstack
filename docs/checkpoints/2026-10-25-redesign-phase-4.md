# UI redesign, phase 4: page layouts — October 25, 2026

Parent: `d071b1c`. Delivers the Opportunities hub, Talent filters, the Skills sections and the feed share box, with the removals the owner approved on October 24.

## Changes

- **Opportunities hub** (`/opportunities`): a row of sections, one page each.
  - **Browse**: search plus **type** (job, internship, contract, collaboration) and workplace filters; cards show type and workplace chips, organization, location, compensation and skills.
  - **Suggested for you** (`/opportunities/suggested`): the skill matcher that lived in the intelligence workspace. The latest run's matches render inline; a form starts a new run; earlier runs are listed; the daily quota is one line.
  - **My applications** (`/opportunities/applications`, `?job=` for one listing).
  - **Hiring** (`/opportunities/hiring`): post an opportunity, your listings and the hiring inbox, for organization managers; others are pointed to Collab.
- **Talent** (`/talent`): **availability** and **skill** filters (new `availability` and `skill` parameters on the careers query, matched case-insensitively against profile skills); cards with photo, handle, availability chip, headline, roles, skill tags and project evidence. Recruiters see **Post an opportunity**.
- **Skills** (`/assessments`): sections **Skill checks**, **Your results** (`/assessments/results`) and **Practice plans** (`/assessments/plans`, the AI learning plans with a one-line quota).
- **Feed**: an inline "Share what you are building…" box with the member's photo opens the composer.
- **Repository security review** (`/repositories/<id>/security`) lists that repository's previous scans; the analysis history query accepts `kind`.
- **Removed, with redirects:** `/community` → `/home`; `/career` → `/opportunities/hiring` (`/career?job=` → `/opportunities/applications?job=`); `/career/applications` → `/opportunities/applications`; `/intelligence` → `/opportunities/suggested` (result pages `/intelligence/<id>` and `/intelligence/plan/<id>` keep their URLs). The "Usage today" card is gone; quotas are one line where they apply. `features/intelligence/workspace.tsx` and `CareerWorkspace` were deleted.
- Every link to the old pages was updated (footer, job cards, application thread, bookmarks, post page, analysis pages).

## Validation

- Unit: 800 passed. Embedded PostgreSQL: 226 passed, 2 skipped; `tests/careers.integration.test.ts` covers the availability and skill filters (including a rejected value), `tests/intelligence.integration.test.ts` the `kind` filter.
- Typecheck, lint and the format check pass. The built API starts and answers `/api/healthz`. Generated API clients regenerated and committed.
