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

## Part 2: access, abuse and secrets

- `PROXY_REQUIRED=true` makes the API refuse requests that did not come
  through the web tier (health probes and the auth SMS hook excepted). The web
  tier now always sends the shared secret. Turn it on only after both tiers
  share the secret.
- Git clones: anonymous clients get a third of a member's budget, and at most
  four packs run at once, of which anonymous clones may hold two.
- The browser error relay accepts 30 reports per address per 10 minutes.
- The editor preview can no longer open dialogs (`allow-modals` removed) and
  shows a warning that the page is repository code, not ProofStack.
- `GITHUB_TOKEN_SECRET` seals saved GitHub tokens with their own secret;
  `SESSION_SECRET_PREVIOUS` keeps sealed data readable during a rotation.
- Sign-up and password changes refuse passwords found in known breaches
  (Pwned Passwords range API, k-anonymity, fails open; `PASSWORD_BREACH_CHECK=off`).
- A member can have at most 10 demos published at once.
- `/community` left the sitemap.
