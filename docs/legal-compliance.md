# Legal compliance (India first)

This maps each obligation ProofStack is subject to, as a jobs-and-skills platform hosting user content and run from India, to what the code does. It is an engineering checklist, **not legal advice**. Have an Indian technology lawyer review the published pages and this list before a public launch.

Operator facts (name, address, contact, Grievance Officer, jurisdiction) live in one place: `OPERATOR` in `artifacts/proofstack/lib/legal.ts`. Every page reads from it. While any value still contains `[...]`, the pages show a "being finalised" notice. **Do not launch publicly until it is filled.**

## Laws and how they are met

### Digital Personal Data Protection Act, 2023 (DPDP) and DPDP Rules, 2025

Most obligations apply from May 2027, but the platform is built to them now.

| Obligation                                                     | Implementation                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice before consent (s.5)                                    | `/privacy`; the sign-up form links the Terms and Privacy Policy                                                                                                      |
| Free, specific consent with a record (s.6)                     | Unticked checkbox; `consent_records` stores the version and time. `TERMS_VERSION` bumps force re-acceptance through the agreement gate                               |
| Withdrawal as easy as giving consent (s.6(4))                  | "Delete my account" on `/account`                                                                                                                                    |
| Purpose and storage limits (s.8(7))                            | Retention in `applyRetention()`, stated in the Privacy Policy §8                                                                                                     |
| Security and breach notice (s.8(5)–(6))                        | See the security docs. A breach is notified to the Board and affected users (process below)                                                                          |
| Rights to access, correction, erasure and grievance (ss.11–13) | "Download my data" (`GET /api/auth/account/export`), profile editing, account deletion, Grievance Officer                                                            |
| Nomination (s.14)                                              | By email to the Grievance Officer                                                                                                                                    |
| Children (s.9)                                                 | Accounts are **18+**. Date of birth is required; under-18 sign-up is refused before an account exists, and an under-18 date at the agreement gate erases the account |
| Cross-border transfer (s.16)                                   | Providers are listed in Privacy Policy §6–7; none is in a restricted country                                                                                         |

### IT Act, 2000 s.43A and the SPDI Rules, 2011

- A published privacy policy (rule 4) and a Grievance Officer (rule 5(9)).
- No sensitive personal data (passwords stay with Supabase; no financial, health or biometric data) is stored.

### IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021

ProofStack hosts user content, so it is an intermediary. It is not a significant social media intermediary (fewer than 50 lakh users), so no Chief Compliance Officer or Indian resident officers are needed.

| Rule                                                                                                                | Implementation                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 3(1)(a) publish rules, privacy policy and user agreement                                                            | `/terms`, `/privacy`, `/community-guidelines`, linked in the footer |
| 3(1)(b) inform users of prohibited content                                                                          | Terms §5 reproduces the rule's list                                 |
| 3(1)(c) remind users of the rules at least yearly                                                                   | **Pending**: annual notification or email (see below)               |
| 3(1)(d) remove content within 36 hours of a court or government order                                               | Terms §7; **process plus moderator tool pending**                   |
| 3(1)(h) keep registration details 180 days after deletion                                                           | `deleted_accounts` with `purge_after`, then purged                  |
| 3(2) Grievance Officer published; acknowledge in 24 hours, resolve in 15 days; content removal requests in 72 hours | `/contact`, footer, Terms §8                                        |
| 3(2)(b) remove non-consensual intimate imagery within 24 hours                                                      | Terms §7; **moderator content takedown tool pending**               |
| Grievance Appellate Committee                                                                                       | Terms §8 and `/contact`                                             |

### Other

- **CERT-In directions (April 2022).** Report cyber incidents within 6 hours. Keep ICT logs for 180 days.
  - Security logs and ended sessions are kept 180 days to 1 year.
  - **Gap:** the directions say logs should be kept within Indian jurisdiction. The database is in Singapore and the API in the United States. Moving to Indian regions needs paid plans (Neon or Render in Mumbai).
- **Consumer Protection Act, 2019 and E-Commerce Rules, 2020.** These apply once anything is sold: show the seller's details, price, refund and cancellation terms, and a grievance officer. There are no paid features yet; the Terms promise the terms will be shown before purchase.
- **Child and Adolescent Labour Act, 1986.** Accounts are 18+, and the Terms bar employers from unlawful requirements.
- **GDPR / UK GDPR.** A short section in the Privacy Policy covers visitors from the EU and UK.

## Cookies

Only strictly necessary cookies are set (`__Host-ps-session`, `-csrf`, `-flow`, `-device`), plus theme and return-path browser storage. There is no analytics, advertising or tracking, so no consent banner is required. Adding any such tool requires a consent mechanism first.

## Retention (`artifacts/api-server/src/services/auth-cleanup.ts`)

| Data                                | Kept                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| Account content                     | Until the user deletes it or the account              |
| Registration details after deletion | 180 days                                              |
| Ended sessions                      | 180 days                                              |
| Security audit logs, notifications  | 1 year                                                |
| Encrypted backups                   | 30 days (R2 lifecycle rule; see `docs/operations.md`) |

## Operating procedures the operator must follow

1. **Grievances.**
   - Monitor the grievance mailbox daily and acknowledge within 24 hours.
   - Resolve within 15 days, or 72 hours for removal of prohibited content and 24 hours for intimate imagery.
   - Keep a log of each complaint and its outcome.
2. **Government or court orders.** Remove the content within 36 hours, and keep the order and the action taken.
3. **Personal data breach.**
   - Within 6 hours, report to CERT-In (incident@cert-in.org.in).
   - Without delay, notify the Data Protection Board and affected users, describing what happened, the likely impact and what users can do.
   - Rotate credentials and record the timeline.
4. **Law enforcement requests.** Answer only lawful, written requests, and disclose the minimum needed.

## Still to build (in priority order)

1. Fill in `OPERATOR`. The grievance email needs a real domain mailbox.
2. A moderator **content takedown tool**: remove a post, comment, project or image by link and record why. Today moderators can only disable accounts, which is too blunt for 24- or 36-hour takedowns.
3. An in-app **report** button that creates a tracked grievance ticket with an automatic acknowledgement.
4. An annual "our rules" notification to all users, and notification when the Terms change.
5. Parental-consent flow if under-18 users are ever allowed (DPDP s.9 requires verifiable consent and no tracking or profiling of children).
6. Indian data residency for logs, when paid plans allow.
