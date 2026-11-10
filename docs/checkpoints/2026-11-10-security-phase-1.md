# Security fixes, phase 1 (2026-11-10)

Fixes from the security review that need no product decisions.

## Part 1: demo and stored-code lifecycle

- Demos are published as complete versions (`v/<version>/…`) and switched
  with a `current` pointer, so a failed republish leaves the old demo live.
- Demos refuse programs and archives (`.exe`, `.zip`, …). The demo site
  serves only known file types and sends `noindex` and anti-framing headers.
- Deleting a project or an account removes its saved code (R2 bundle) and its
  demo. Making a project or organization non-public takes its demos down.
- A username change moves demos and rewrites saved Repository and Demo URLs.
  The old username is kept for its previous owner for 90 days
  (migration 0021, `retired_handles`), and old repository addresses redirect.

Migration 0021 must be applied to staging and then production (on the
owner's "migrate production") before the API is deployed.
