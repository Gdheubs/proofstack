# Static analysis and cryptographic remediation

## Executed tools and scope

- Dependency advisory audit: `pnpm audit --audit-level moderate --json` exited 0 after the scoped Firestore gRPC update; zero registry advisories. This does not mean zero application vulnerabilities.
- Gitleaks 8.30.1: official release checksums verified; both existing Git commits scanned. Public Supabase publishable-key syntax, an exact published RFC6238 fixture and an exact historical prose match have narrowly reviewed rule-specific exceptions. Synthetic canaries proved that a new credential-shaped value in the same documentation file and the RFC seed outside its test remain detectable. No broad docs/tests skip is used.
- Semgrep **1.181.0** actually ran in a network-disabled, CPU/memory/PID-bounded container. Image digest: `sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b`.
- Rules came from the official `semgrep/semgrep-rules` commit `9bbf021d0acffa3095fcffd17b2bc7787eb4796d`: 205 JavaScript/TypeScript rule files, **214 rules**. Merging retained patterns and prefixed IDs with their official file paths; payload SHA-256 is `3c0459de2a0b9f9e73e5bb3463df69b2c77d69538c2dd6e905abce2079a3e6f4`.
- Initial container scan covered **238 application files** from the retained clean-build snapshot. It reported **611 raw findings**, four partial-parse warnings, and exited **1**. Findings were not silently suppressed or described as 611 confirmed vulnerabilities.

Early WSL runs stalled in 9p filesystem RPC while walking source/configuration files. Only task-owned scanner process groups were stopped; the successful alternative copied the secret-free archive into the container's native filesystem. No OS/WSL restart, application process kill by name, or production operation was used to make the scanner pass.

## Confirmed defect fixed through RED → GREEN

**Component:** `artifacts/api-server/src/lib/auth-crypto.ts`.

**Severity:** High cryptographic-integrity hardening. A direct remote login bypass was not demonstrated.

**Root cause:** AES-GCM decryption did not specify an expected tag length. On the actual Node 24 runtime, truncating a valid envelope's tag to **4, 8 or 12 bytes** still decrypted successfully. Base64url decoding also silently accepted invalid characters.

**Reproduction:** Four new regression cases failed before the implementation: three shortened-tag cases and invalid-character transport. The runtime also emitted `DEP0182`, confirming use of short tags without an expected length.

**Fix:** Require canonical nonempty base64url parts, a 12-byte IV and a full 16-byte tag; specify `authTagLength: 16` for both encryption and decryption. Purpose-bound HKDF/AAD and the three-part envelope format are unchanged. Existing canonical 12-byte-IV/16-byte-tag session envelopes remain compatible; no live key was replaced, no provider setting changed and no credential values printed.

**Verification:** Focused auth/security plus native-fixture scheduling regressions passed **18 tests** after the correction. The subsequent full database-enabled suite passed **723 tests**, including native PostgreSQL integration and explicit overlapping cleanup-worker claims. The initial uncorrected scan remains retained rather than relabeled clean.

## Initial findings by class and disposition

| Rule class                        | Raw count | Disposition                                                                                                                                                                                                                                   |
| --------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSX not internationalized         |       563 | Informational localization recommendations, not demonstrated security vulnerabilities. No unnecessary UI/i18n rewrite was performed.                                                                                                          |
| Missing template-string indicator |        18 | Manual review required; current examples include deliberate SQL placeholder/template composition. Do not equate a pattern hit with executed injection.                                                                                        |
| No stringify keys                 |        14 | Correctness/style warnings around JSON serialization; SQL JSONB payloads and validated column/value builders require contextual review.                                                                                                       |
| No replaceAll                     |         6 | Portability/style recommendations; Node 24 is the declared runtime. Not a demonstrated vulnerability.                                                                                                                                         |
| Regex/ReDoS audit                 |         3 | Namespace expressions operate on configuration/captured targets with delimiter-separated character classes. No exponential input attack was demonstrated; keep length/capacity policy review in deployment acceptance.                        |
| React props spreading             |         2 | Informational component API review; not demonstrated authorization bypass.                                                                                                                                                                    |
| Dynamic notification href         |         2 | Current server policy accepts recognized canonical destinations only and rechecks resource access. Covered by 24 SQL notification regressions. This is not a license to trust arbitrary future href producers.                                |
| AES-GCM missing tag length        |         1 | **Confirmed and fixed**, with failing shortened-tag/canonical-transport tests first.                                                                                                                                                          |
| HTTP request                      |         1 | Existing Replit adapter uses a fixed loopback sidecar, not an arbitrary external HTTP destination. Its private deployment trust/identity boundary must still be verified; do not rewrite the supported adapter to an invented HTTPS endpoint. |
| Direct response write             |         1 | Git upload-pack binary protocol response, not HTML rendering. Inspect the explicit Git content type, bounded subprocess and global `nosniff`; replacing it with HTML rendering would break the protocol.                                      |

The four partial-parse warnings concerned valid JSX text containing ampersands in career, profile, clone and header components. Next/TypeScript builds accept these files; Semgrep did not fully parse those spans. They remain a **scanner coverage limitation**, not a reason to claim a complete scan or modify unrelated UI merely to silence a tool.

## Security acceptance boundary

The initial Semgrep gate is nonzero and must **not** be called passing. A follow-up scan can demonstrate removal of the confirmed crypto finding, but it does not automatically resolve informational findings, manual-review items, partial parsing, upload ingress/decoder safety, cross-store lifecycle gaps or hosted infrastructure controls. CodeQL is configured in CI but no hosted run is available without a Git remote/repository context.

Targeted dynamic security coverage comes from actual Express/SQL regressions and isolated production-browser flows: CSRF, strict input handling, native provider boundaries, tenant/owner access, revocation, cache headers and failure paths. This is not an independent full DAST/penetration-test certification.

## Artifacts

- Initial raw scan: `.local/production-audit/semgrep-container-final.json` and `semgrep-container-console.txt`.
- Rule provenance: `semgrep-rule-provenance.json`, `semgrep-official-rules.json`.
- Auth regression source: `tests/auth-security.test.ts`.
- Native full-suite report: `native-verified.json`; earlier failed parallel run retained as `native-final.json`.
- Secret canary harness/report: `verify-secret-canaries.py`, `secret-canaries.redacted.json`; no canary is a usable vendor credential.

Primary references: official Semgrep rules repository at the pinned commit; official Gitleaks v8.30.1 README/configuration and checksums; Supabase API-key documentation distinguishing publishable from privileged keys; OWASP ASVS 5.0.0 as a review framework, not a claimed conformance level.
