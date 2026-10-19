# Platform workflow verification — October 19, 2026

## Scope

Verify the repository collaboration, hiring/listing, application, and assessment workflows requested for ProofStack. This was a code/test verification only; no product code or deployment was changed.

## Findings

- **Repository collaboration:** supported. Members with write access can create a repository for a project, create working branches, add/edit/delete UTF-8 text files up to 32 KiB in the browser, and commit changes to a non-default branch. Pull requests support review, checks, conflict rejection, protected-default-branch merge, and releases. HTTPS clone/fetch is supported with optional read tokens for private repositories.
- **Repository upload/push limits:** arbitrary local Git push is not supported; the API accepts `git-upload-pack` only and rejects `git-receive-pack`. The browser editor is not a general file upload control and does not support binary or large-file uploads. Describe this as browser-based source editing plus read-only clone/fetch, not unrestricted repository upload.
- **Employer requirements:** supported as a listing. Organization managers can publish title, free-text description for responsibilities/requirements/hiring process, skill tags, role type, workplace, region, compensation, and open/closed status. Publishing requires a public organization profile.
- **Applications and recruitment workflow:** supported in a fixed format. Candidates submit a private note plus selected project evidence; authorized hiring teams can review applications, move them through stages, and message candidates. There is no provider-configurable application form or custom question builder.
- **Tests/assignments:** custom employer-authored assessments or take-home assignments are not implemented. The assessment catalog contains two static, platform-wide self-directed skill checks; assessment attempts are user-owned and are not linked to a job listing.

## Validation

- Frontend route/API tests: 47 passed across repository navigation, repository pages, assessment UI, and assessment API.
- Embedded PGlite careers, pulls, and assessments integration suites passed (25 tests); the repository Git integration case hit the known 15-second PGlite timeout locally. Hosted native-PostgreSQL CI passed the full `test:all` suite.
- Hosted [ProofStack CI](https://github.com/Gdheubs/proofstack/actions/runs/39200572620) and [ProofStack Security](https://github.com/Gdheubs/proofstack/actions/runs/39200572607) passed on commit `98cbeda03b22969be5fc2a486be0614aeba6dd5f`.
- No live browser E2E session was run in this verification. Browser skill-check coverage is opt-in via `RUN_BROWSER_TESTS=1` and is separate from the hosted CI pass above.

## Next action

If product scope requires unrestricted Git push/binary upload, custom employer application forms, or job-linked assignments, implement those as separate features with explicit authorization, storage, privacy, and acceptance criteria. No deployment was performed.
