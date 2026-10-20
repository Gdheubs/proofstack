# Phase 5: reviewed collaboration and releases

This milestone implements pull requests, source diffs, draft/ready/closed/merged states, discussion, commit-specific reviews, a server-run patch check, guarded Git merges, linked-task completion, and immutable release notes/Git tags. It uses Phase 4 repository storage and permissions. It does not execute application code, run arbitrary CI scripts or deploy releases.

## Use the workflow

1. Open a project’s Repository, create a working branch, and commit the change there. Direct commits to the default branch are now rejected for everyone, including managers. Repository initialization is the only initial-commit exception.
2. Open Pull requests → create a proposal, choose source/target branches, describe the change and testing, optionally link a project task, and choose draft or ready. Only one active proposal may cover a given branch pair.
3. Another currently authorized contributor reviews the displayed diff and submits approval or changes requested. The author cannot formally review their own request. Reviews record the exact source and target commit IDs. Drafts must be marked ready first.
4. Run the built-in patch check after branch changes. Creation also runs it automatically. This invokes Git whitespace validation; it is not an application test suite, build, vulnerability scan, or configurable CI runner. Clients cannot supply a success result.
5. A project manager verifies MFA and merges. The server rechecks both branch heads, current reviewer access, the latest decisions, the current check, quota and Git mergeability under database locks. It creates a real two-parent merge commit, updates the target branch and records the audit event atomically in database state. A linked task moves to done only when merged into the default branch.
6. In Releases, a manager verifies MFA and publishes version notes at a commit reachable from the default branch. The release and lightweight Git tag cannot be edited or retargeted through the API. Git reads rebuild branch and tag refs from authoritative database records.

## Merge invariants

- At least one current, non-author approval is required. Only each eligible reviewer’s latest decision for the exact pair of commit IDs counts. Current changes-requested decisions block merging.
- Any source or target advance makes prior approvals and checks stale. The API rejects old submitted heads, even if a stale browser still shows a green state. Review forms explicitly acknowledge the displayed commit pair and reset when the pair changes.
- Disabled users and contributors whose access was revoked no longer supply merge approval. Ownership/profile labels do not bypass project permissions.
- Default-branch direct writes are blocked; release creation is restricted to reachable default-branch commits. Merge and release creation require recent native MFA.
- Merged requests are terminal. Closed requests can be reopened by an authorized author/manager, subject to branch-pair uniqueness. Reopening uses current branch heads and existing reviews only if they still match exactly.
- A merge conflict leaves the target unchanged. The check status does not imply conflict freedom; Git performs the actual mergeability check at merge time. Conflict resolution/rebase tooling remains a later milestone. Conflicting work can be recreated on a fresh branch from the latest target and submitted in a replacement request; do not bypass review by editing database refs.
- Comments, checks and reviews are audited transactions. Pulls, reviews, comments, patches and releases inherit repository/project visibility. Responses use private/no-store; account changes reset collaboration query caches.

## Bounds and storage

Migration `0007_sharp_krista_starr.sql` adds repository_pull_requests, repository_pull_reviews, repository_pull_comments, repository_pull_checks and repository_releases. Apply it with the tracked migration runner before starting this version. No startup migration is performed.

Lists page at 20 entries with the existing 10,000-offset ceiling. A repository is limited to 10,000 pull requests and 100 releases. Each request supports up to 500 comments and 500 formal reviews; views show the latest 100 of each. The browser diff is capped at 256 KiB and 200 file names; oversized patches require local review. Git command, storage and concurrency limits from `repositories.md` still apply. Linked-task selection shows up to 100 unfinished project tasks.

Release records are immutable while their project exists; deleting the project or organization still invokes the existing foreign-key cascades. Review the retention policy before production enrollment. Git refs and objects must be backed up with the database. Failed Git object creation/merge attempts may leave unreachable objects counted against quota; no automatic pruning or destructive cleanup is introduced.

## Remaining Phase 5 work

- Isolated ephemeral CI runners, trusted job dispatch/worker identity, network/secret restrictions, resource budgets, durable job logs/artifacts, retries and cancellation.
- Deployment environments, protected promotion/rollback, signed artifacts and release automation.
- Conflict resolution/rebase UI, richer review threads and requested reviewers.
- Real staging browser/MFA journeys, native PostgreSQL concurrency tests, durable-volume restore drills and representative load tests.

SSH remains a Phase 4 gap; HTTPS push is limited to write-token feature branches. These existing gaps are carried forward explicitly; the presence of pull requests and a patch check does not make the full GitHub-style platform launch-ready.
