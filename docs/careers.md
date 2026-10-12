# Project-backed careers and collaboration

ProofStack now connects project portfolios with job discovery and team work. These features extend Phase 3 and introduce a small part of Phase 5. Repository URLs still link to external hosts; ProofStack does not yet host Git repositories, execute CI, or verify authorship from commits.

## Product flows

| Audience    | Flow                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder     | Publish a project, include repository/demo links, and accept or invite contributors. Open its Work board to track tasks and attach evidence.                                                          |
| Job seeker  | Open Career workspace, set availability, opt into public talent discovery, and pin up to three public projects. Find opportunities and apply with a contribution statement and one to three projects. |
| Employer    | Create a public organization profile, verify MFA, and publish a job, internship, contract, or collaboration opportunity. Set workplace, skills, compensation, and draft/open/closed status.           |
| Hiring team | In Career workspace, switch to Hiring inbox. Open an application to review evidence, move it through permitted stages, and exchange private messages.                                                 |
| Applicant   | Track stages and messages in Career workspace. Withdraw an application to close its conversation.                                                                                                     |

No directory opt-in is required to apply. Applications do not expose email addresses or phone numbers. Career preferences are not automatically copied into applications. Profiles, contribution claims, compensation, and external links are user-supplied; there is no automatic candidate ranking or independent verification badge.

## Permissions and privacy

- Talent discovery is off by default. A closed availability or disabled account excludes a candidate from discovery.
- Only active organization owners/admins with both read and management grants can manage hiring. A “company” or “recruiter” profile label grants no permissions.
- Public opportunities require an open listing and a public organization profile. Managers retain access to drafts and closed listings. Existing applicants can still see their listing after closing or an organization privacy change.
- Job management and hiring-stage changes require recent native MFA. The frontend opens the existing MFA verification dialog and retries once after success.
- Applications and messages are readable only by the applicant and current authorized organization managers. Suspended/revoked membership removes hiring access. All career responses are private/no-store; account changes reset career query caches.
- Project evidence references are validated on submission against public projects owned by the candidate or with an active accepted contribution. Reads recheck current project/organization visibility and active owner/candidate status. Making evidence private or deleting it removes it from application and directory responses; private snapshots are never retained.
- Project boards inherit project visibility. Owners/managers can edit and assign tasks. Accepted contributors can create tasks and edit tasks they created or are assigned. Contributors cannot reassign others’ tasks. Assignees must remain active project participants with required organization access.
- Actions use CSRF checks, database-backed rate limits, strict per-action input validation, parameterized SQL, transactionally appended audit events, and row locks for workflow updates. A unique job/applicant index prevents duplicate submissions.
- Messages are append-only. Rejected/withdrawn applications close messaging. Hiring stages cannot reopen a terminal application. Applicants may withdraw other stages.

## Backend and schema

`GET /api/careers` serves bounded views: jobs, job, talent, dashboard, applications, application, and project-work. `POST /api/careers/action` handles career-save, job-save, apply, application-status, message, and issue-save. The OpenAPI contract is in `lib/api-spec/careers.yaml`; regenerate clients through the existing codegen command after changes.

Migration `0005_faithful_pepper_potts.sql` adds career_profiles, career_jobs, career_applications, career_messages, and project_issues, with foreign keys, workflow check constraints, paging indexes, and application uniqueness. Apply through the tracked migration runner; do not use schema push against an existing deployment.

Discovery and application evidence is loaded in one batch per page. List pages are limited to 20 results with a 10,000 offset ceiling. Message threads return the latest 100 messages and poll every 15 seconds. This is intentionally bounded, not an unbounded chat history or realtime service. Public text search currently uses parameterized ILIKE; benchmark representative data and add a measured search/index strategy before high-volume rollout. Own-project selection exposes the latest 50 public projects; the dashboard shows the latest 20 managed listings.

Deleting an organization deletes its listings and applications through foreign-key cascades. Current account deletion also cascades authored listings. Document the product’s retention policy and review this behavior before production enrollment; there is no application export or legal retention policy implementation in this checkpoint.

## Acceptance before launch

Run the checked-in native PostgreSQL CI workflow. In staging, test with separate applicant, hiring-manager, member, and outsider accounts: opt-in/out, draft/open/closed listings, project selection, duplicate applications, MFA retry/cancel, inbox scope, stage changes, messages, withdrawal, contributor assignments, organization privacy changes, and access revocation. Verify mobile layouts, keyboard interaction, screen-reader labels, and account switching in an actual browser. Confirm backups, retention, moderation/reporting operations, and load behavior before public hiring rollout.

This checkpoint was tested locally with the SQL engine adapter and production HTTP processes. Live provider flows, native PostgreSQL concurrency/transport, browser hydration and deployment remain unverified.
