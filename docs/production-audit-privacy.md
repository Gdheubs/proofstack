# Privacy and data-protection applicability review

Audit scope: current application source and the local development configuration. This is a technical gap assessment, **not legal advice or a compliance certification**. No production personal-data export, erasure, retention change or provider reconfiguration was performed.

## Observed processing

| Data family                    | Actual processing / boundary                                                                                                             | Acceptance gap                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity and contact           | Managed Google/GitHub Firebase identity; app account/contact/verification state; encrypted provider session envelopes and hashed handles | Native MFA enrollment/recovery, complete credential-event lifecycle and provider-specific operator bootstrap remain incomplete                               |
| Public community               | Profiles/handles, projects, social activity and assessment results can be published                                                      | Publication controls, retention and user-facing disclosure need owner approval; a published handle is not a blanket legal permission for every secondary use |
| Organizations and repositories | Membership/grants, private project/source data, Git author metadata, collaboration and audit events                                      | App-enforced access does not replace infrastructure grants; cross-store erasure and paired recovery are incomplete                                           |
| Hiring and learning            | Discoverability, applications, private messages, hiring stage decisions, skills and assessment history                                   | Document purpose, retention, applicant rights and permitted secondary use; do not claim an automated hiring/legal classification from a score alone          |
| External AI/SMS                | Optional vendor processing; direct writing assist can transmit supplied text, while queued plans have separate consent/budget checks     | Approved provider/model/regions/retention and consistent consent/spending controls are not established across all paths                                      |
| Security and operations        | Device/session bindings, abuse counters, audit records and operational diagnostics                                                       | Define minimization, access, retention, legal holds and incident response; never export raw session credentials in a user data package                       |

## Conditional legal matrix

| Regime                        | Applicability facts still needed                                                                                                                    | Engineering implications and source                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EU GDPR                       | Controller/processor establishment; offering services to or monitoring people in the EU; actual purposes and legal basis                            | If Article 3 brings processing in scope, assess notice/lawful basis, access, erasure, portability, processor terms, security/breach response and international transfers. Articles 6, 13–15, 17, 20, 28, 32–34 and Chapter V are relevant review points, not a claim that every request or remedy is unconditional. [P1]                                                                  |
| India DPDP framework          | Actual Indian digital-personal-data processing/targeting, entity role, age groups, exemptions and the commencement provisions applicable at release | The DPDP Act and notified 2025 Rules use **phased commencement**. Do not describe every substantive provision as already in force from enactment alone. Confirm the current gazette/corrigenda and operative date with the legal owner; map notices/consent, safeguards, breach handling, rights/grievance contacts, children's data and processor arrangements where applicable. [P2–P4] |
| US/state privacy              | Business/entity location, resident populations, statutory thresholds, processing activities and exemptions                                          | No applicability or exemption determination is possible from the user's estimated location. Identify the relevant states and thresholds before claiming CCPA/other-state compliance. Hiring data and any future consequential automated decisions need a separate review.                                                                                                                 |
| Customer payments / PCI scope | No customer checkout, charge, refund or payment-webhook implementation was found in current routes/schema/dependencies                              | Payment integration tests are not applicable to the implemented scope. This is not a legal or PCI exemption determination. AI/SMS vendor spending still needs abuse/cost controls.                                                                                                                                                                                                        |

## Source-confirmed technical gaps

1. No complete authenticated account export or durable whole-account erasure/ownership-transfer workflow is implemented. Disabling an account is not physical erasure.
2. Asset/Git metadata cascades are not proof that all external bytes, versions, delivery systems and backups were erased. The cleanup outbox work addresses a specific deletion transaction hazard, not the entire privacy lifecycle.
3. Retention is feature-specific rather than a complete owner-approved schedule. Pending uploads, incomplete attempts, conversations, activity/audit history and vendor copies require explicit decisions.
4. Native factor/recovery and some clone/recovery credential revocation paths need security-event lifecycle completion.
5. Direct writing-assist and queued AI flows have different consent/global-spending controls. A provider URL or prompt instruction is not a data-processing agreement.
6. Hosted regions, storage encryption, database TLS/grants, subprocessor terms, backup retention/PITR and incident notification operations were not certified.

These remain release gates for the intended real-user scope. Implementing an empty export/deletion endpoint, deleting only SQL rows, or marking a disabled user as erased would not satisfy them.

## Required owner decisions before release

- Identify the legal entity, controller/processor roles, intended countries, permitted age groups and public/private launch audience.
- Approve the data inventory, purposes/legal bases, notices, publication choices, retention/holds, processor agreements and regional/cross-border handling.
- Define a verified requester/fresh-assurance workflow for export/deletion, organization ownership resolution, durable provider/object/Git operations, backup deletion replay and auditable completion.
- Establish named privacy/security contacts and an incident procedure with verified external notification delivery. Obtain qualified legal review of actual applicability and effective dates.

## Primary references retrieved during this audit

- [P1] Official EUR-Lex consolidated GDPR text, including territorial scope and data-subject/security chapters: `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02016R0679-20160504&from=EN`.
- [P2] MeitY official Digital Personal Data Protection Rules, 2025 publication: `https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa`.
- [P3] Official Rules gazette, G.S.R. 846(E), notified November 13, 2025, published in the November 14 electronic gazette: `https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf`.
- [P4] Official Act commencement notification, G.S.R. 843(E), with separate commencement periods: `https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf`.

Primary source search identified these instruments; this audit did not complete a legal update/corrigenda search for every jurisdiction. Therefore the report deliberately does not certify a present or future legal compliance date.
