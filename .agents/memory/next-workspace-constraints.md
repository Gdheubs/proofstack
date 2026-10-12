---
name: Next.js workspace constraints
description: Non-obvious Next.js preview and pnpm type-resolution constraints.
---

## Development origins

Allow the exact workspace development hostname and local screenshot hostname for Next.js development resources; do not assume a single-level wildcard covers nested Replit development domains.

**Why:** Next.js rejects unmatched development-resource origins. Blocked HMR connections can leave client-rendered status panels loading even while the server and API respond successfully.

**How to apply:** Keep the allowlist development-only and limited to the current workspace hostname plus localhost/127.0.0.1. Check HMR and client hydration when a proxy origin changes.

## Router roots

Keep Next.js App Router and any Pages Router directories under the same parent. An unused legacy src/pages directory still participates in route discovery.

**Why:** Next.js autodiscovers router directories independently of TypeScript includes and imports, and rejects mixed root locations.

**How to apply:** Do not introduce a legacy src/pages directory alongside a root app directory; remove obsolete scaffold routes or choose one consistent parent.

## Named type augmentations

TypeScript module augmentations need their target type package to be directly resolvable from the declaring workspace package under pnpm.

**Why:** pnpm isolates transitive dependencies. Types available through a library import may still be unavailable as a named augmentation target.

**How to apply:** Declare the corresponding type package in the owning package's development dependencies instead of relying on accidental hoisting.