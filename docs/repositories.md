# Phase 4: native repository foundation

This milestone adds real bare Git repositories, source browsing, branches, commit history, safe web commits and read-only Git smart-HTTP clone/fetch. External push, SSH, remote import, arbitrary hooks and code execution are disabled. Pull requests and guarded merges are described in `pull-requests.md`; arbitrary CI remains later work.

## Storage and consistency design

Each project may own one repository. Its visibility and membership always come from the project; it cannot override a private organization's policy. A separate repository folder is addressed only by a server-generated UUID under an explicitly configured durable REPOSITORY_ROOT. No user path selects a filesystem repository. Storage is disabled unless configured.

PostgreSQL branch rows are authoritative refs. Web writes create immutable Git objects first, then atomically update the branch row and append the audit event. An expected-head check rejects stale edits. All repository reads synchronize physical refs from database heads under the repository row lock, so a crash after a database commit is recoverable on the next read. Failed writes can leave unreachable objects, counted against the storage limit. Do not run automatic pruning or filesystem-only restores.

Git runs without a shell, with a minimal environment, disabled hooks/external protocols/global configuration, bounded command output, a timeout and process concurrency limits. There is no checkout or execution of repository code. Accepted text files have validated relative paths, bounded UTF-8 content and no .git metadata paths. The default branch is protected: all users work on other branches and use reviewed pull requests to merge. Branch rewrites and branch deletion are not exposed.

Clone credentials are opaque, repo-scoped read tokens, shown only at creation and stored as hashes. They expire after 30 days, can be revoked, require MFA to mint and are rechecked against current project access and active identity for every request. Public repositories allow anonymous clone. Private repos require a token; browser cookies alone do not authorize Git RPC. Push endpoints are deliberately absent.

## Deployment gate

Install Git and configure REPOSITORY_ROOT to an absolute path on a private durable POSIX volume shared by the API processes. Do not point it at source code, a public directory or ephemeral deployment storage. The API filesystem account must own it. Web replicas serialize operations with database locks, but correctness also requires every replica to use the same durable repository volume. For multi-region operation, use a dedicated Git storage service before scaling out.

Back up PostgreSQL and the Git volume as one recovery unit. Restore both to a consistent checkpoint and run repository reads to rebuild refs. Keep a volume snapshot before cleanup; unreachable objects and orphan UUID directories require operator reconciliation against the database. This milestone has no automatic deletion or garbage collection. A quota failure is explicit and requires operator review. Do not deploy public Git hosting without restore drills, tenant abuse controls, native concurrency tests and storage monitoring.

## Included workflow and limits

Open a project and choose Repository, then initialize it with README. All users create a working branch and use New file / Edit file to make auditable commits. Commit history links open reachable historical snapshots. Concurrent changes return a conflict; review current source before retrying. File contents are displayed as escaped text, never executed or interpreted as HTML.

Each project has one repository; each project owner may have 20 repositories. A repository has a 50 MiB storage quota and at most 50 branches. Web commits accept UTF-8 files up to 32 KiB and single-line messages; directories expose at most 1,000 entries and history is paged in groups of 20. Git commands time out after 15 seconds; at most four run concurrently per API process. Clone responses are bounded to 64 MiB and Git RPC request bodies to 1 MiB. Browser/API output is bounded separately. Temporary index files are removed after commit attempts. Git object/reference fsync is requested, but durability still depends on the backing volume.

Clone tokens are read-only, with up to ten active tokens per person per repository and a latest-20 token list. Tokens are not persisted in browser storage; the issuance result is removed from the mutation cache, and the visible token is cleared by identity remount. There is no token recovery: revoke and create another. User identities use a platform noreply address in Git commits rather than exposing private account email.

The existing `.replit` deployment targets autoscale. A writable deployment filesystem is not evidence of durable storage. Leave REPOSITORY_ROOT empty until a dedicated durable volume/service is provisioned. Existing profiles, projects, careers and other features continue working with native repositories disabled. No runtime Git storage is bundled in the source archive.
