# Phase 3 — developer community

## Product boundary

Repository, contribution, experience, achievement, challenge and engineering-evidence records are **user-managed**. GitHub synchronization was not requested for this phase. Challenges are participation/evidence records, not an executable coding judge. A linked repository or accepted contributor relationship does not certify authorship or technical competence.

AI drafts use Replit AI Integrations for OpenAI, billed to Replit credits, after an explicit user action. Profile/project summaries, mentioned-skill extraction, categorization, tags and documentation assistance are unverified suggestions. Drafts require review before saving; no competence score, certification or ranking is produced. No external repository URL is fetched by these endpoints.

## Screens

The existing Next.js product now includes `/community`, `/profile/[handle]`, `/profile/settings`, `/posts/[id]`, `/projects`, `/projects/[slug]`, `/organizations`, `/organizations/[slug]`, `/search`, `/notifications`, `/bookmarks` and `/assist`. No account or profile is seeded at `/profile/suhail`; a real account can claim that handle if available.

Profiles expose only selected public fields; email, phone, session state and provider subjects are never in community DTOs. Profile kinds remain separate from administrative authority.

## API and storage

`lib/api-spec/openapi.yaml` references the local `community.yaml` contract. Orval is explicitly allowed to resolve only that local file. Generated React Query clients are used by the UI.

- `GET /api/community`: bounded, viewer-aware views; collections use 20-item offset pages.
- `POST /api/community/action`: action-specific field allowlists, typed validation, managed identity, completed native MFA where applicable, signed CSRF, per-user/IP limits, transactions and audit events.
- `POST /api/community/assist`: six writing-assistance tasks; no automatic publication.
- `POST /api/community/uploads`: reserves owned image metadata and a final storage key; returns a same-origin `uploadUrl`.
- `PUT /api/community/assets/:id/content`: CSRF-protected, owner-only, rate-limited image body (`image/png`, `image/jpeg` or `image/webp`, at most 8 MiB, within one hour of the request). Size, declared type and signature are checked before the API writes the bytes to private R2 storage and marks the image ready. `asset-complete` then confirms readiness.
- `GET /api/community/assets/:id`: ready image serving only if publicly referenced, owned by the requester or referenced by an accessible project.

A private Cloudflare R2 bucket contains images; PostgreSQL stores ownership and ready/pending metadata. PNG, JPEG and WebP uploads are capped at 8 MiB, checked against actual content type, size and signature before completion. SVG/HTML are rejected. Nonpublic images are private/no-store; even public images are served with no-sniff and restrictive content security policy. Uploaded-but-unused images can be removed; referenced images must be detached first.

## Social and organization access

Follows, likes/reactions and bookmarks use explicit, idempotent toggles with unique keys; counts are computed from records, not client-controlled counters. Mention parsing resolves at most ten active handles to stable user IDs. Follow, reaction, comment, mention and invitation notifications exclude the actor and deduplicate repeated notices for ten minutes.

Project invites are pending until the recipient accepts. Organization projects may only invite active organization members. Accepted contributors may maintain their own project records, but only project owners and organization managers edit core project details. Organization affiliation is fixed after project creation.

Public organization metadata and public projects are discoverable. Private organizations and organization-visible projects are accessible only to active members. Members, teams and repository lists are member-only even for public organizations. Private assets and content are not secured merely by an unguessable URL.

Organization owners alone manage membership roles/removal. Owner/admin grants require a verified native factor on the target; sensitive organization operations require fresh native AAL2 on the actor. The final active owner cannot be removed or demoted. Membership changes revoke target sessions; team and contributor membership are cleared on removal. Owners/admins manage teams/settings; ordinary members do not inherit administrative authority. No platform role is granted by community onboarding.

Deletion confirmation is explicit in the UI. Deleting a project cascades its records and contributors and clears independent post links. Deletion is blocked if clearing those links would make a currently hidden post public; the post author must first delete the post or explicitly detach its project link. The same protection applies to organization deletion. Deleting an organization cascades its projects, teams, memberships and scoped records and revokes member sessions; personal profiles/posts remain. Activity display checks that source resources still exist and are accessible.

## Still deferred from Phase 2

MSG91 template/signed SMS hook, OAuth provider configuration, public SMTP delivery and phone-MFA entitlement remain intentionally deferred. This phase does not claim these delivery channels were verified or publish the app.
