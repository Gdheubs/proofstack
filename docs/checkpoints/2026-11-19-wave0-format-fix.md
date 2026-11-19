# Wave 0 formatting follow-up (2026-11-19)

Parent: `3d6a9ef` (Next.js audit remediation).

## Finding and change

Hosted CI for `3d6a9ef5201d099f40adceeb9803c3375cd89d21` passed the dependency
audit, typecheck and lint, then stopped at `format:check`. The only file named
by the CI formatter was `artifacts/proofstack/lib/navigation.ts`; it was
formatted with the repository's Prettier 3.9.6 binary.

Hosted Security passed on the same parent commit, including its redacted secret
scan and CodeQL analysis.

## Validation and remaining status

- Focused Prettier check for `artifacts/proofstack/lib/navigation.ts`: passed.
- A broad Prettier check on the Windows checkout listed many untouched files;
  it is not treated as a pass. Hosted CI is the authoritative full-workspace
  format result for this Windows checkout.
- No tests, database migrations, browser acceptance, or deployment were run.
- Hosted CI on the parent commit failed only at formatting and stopped before
  subsequent CI jobs. The new commit's hosted CI must be read before treating
  the change as verified.

## Exact next step

Read the hosted CI and Security results for the commit containing this
follow-up. Continue WIRE-1 API contracts only after CI is green.
