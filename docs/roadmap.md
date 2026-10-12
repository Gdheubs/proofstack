# ProofStack seven-phase roadmap

This restores the original Replit product plan. Status describes inspected code, not production certification. The older four-phase foundation roadmap was superseded.

| Phase | Scope                                                                                                               | Current status                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Foundation, design system, API contracts, database, infrastructure                                                  | Implemented; frontend/API builds verified locally                                                                                                                  |
| 2     | Identity, accounts, OTP, MFA, recovery, sessions and security                                                       | Implemented; live provider delivery and deployment configuration pending                                                                                           |
| 3     | Developer profiles, projects, organizations, social feed, search, notifications, evidence and AI writing assistance | Profiles/social plus careers, private applications and project boards implemented; native database/browser/live-provider acceptance still pending                  |
| 4     | Git hosting, repositories, code browser                                                                             | Native repositories, source browser, branches, web commits and clone/fetch implemented; external push and deployment acceptance pending                            |
| 5     | Issues, pull requests, reviews, CI/CD and releases                                                                  | Task boards, pull requests, diffs, reviews, guarded merges, patch checks and immutable releases implemented; isolated CI/CD remains pending                        |
| 6     | AI recommendations and security intelligence                                                                        | Private skill-overlap matches, optional AI plans, bounded static scans and durable metered jobs implemented; live AI/native concurrency/staging acceptance pending |
| 7     | Production operations, scaling, administration and launch                                                           | Security hardening, dependency audit, batched reads, operations dashboard, worker health and runbooks implemented; staging/load/restore launch gates remain        |

## Phase 3 exit criteria

- Verify sign-up, sign-in, native MFA, recovery, logout and session revocation against a dedicated provider environment.
- Run all database integration tests on a disposable PostgreSQL database after tracked migrations.
- Exercise two independent organizations with owner/admin/member/outsider accounts. Confirm private projects, images, membership changes, invitations and last-owner behavior.
- Exercise profile editing, follows, posts, comments, mentions, reactions, bookmarks, notifications, search and pagination in a browser.
- Verify signed image uploads, immutable completion, deletion, quota enforcement and storage lifecycle rules on Replit App Storage.
- Verify optional AI failure states and actual configured model responses without publishing drafts automatically.
- Measure query counts and latency at representative data volumes. Batch remaining per-item queries before high-volume launch; offset pagination is bounded but is not a large-scale feed architecture.

## Careers expansion

The requested GitHub/LinkedIn direction adds opt-in talent discovery, project-backed applications, private hiring stages/conversations and project task boards. See `careers.md`. These are implemented product workflows; actual Git hosting and commit-derived contribution verification remain separate milestones.

## Next implementation sequence

Phase 3 staging acceptance remains outstanding. At the user’s request, Phase 4 now includes native Git objects, database-authoritative refs, a code browser, web commits, protected main and read-only smart HTTP clone/fetch. Finish durable-storage provisioning, native concurrent-transaction tests, browser acceptance and restore drills before enabling it for production. The next Phase 4 milestone is isolated receive-pack/push, branch policy enforcement and push audit/recovery; remote imports and SSH remain unimplemented. Phase 5 now adds reviewed pull requests and tagged releases; isolated CI/CD and conflict-resolution tooling remain pending. Phase 6 now adds separately metered durable jobs, private reviewable outputs, explainable opportunity matching, optional AI learning plans and bounded static repository scans. See `intelligence.md`; live-provider evaluation, native concurrency and browser acceptance remain pending. Phase 7 now adds MFA-protected operations, bounded process metrics, queue/worker alerts, request limits, a local benchmark, preflight checks and recovery runbooks. Production load targets, external alert delivery, native backup/restore drills and a staging rollback rehearsal remain launch gates. See `operations.md` and the Phase 7 review.

No phase is considered complete merely because its navigation or schema exists. Do not describe this snapshot as bug-free or fully production-ready.
