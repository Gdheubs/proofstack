import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "../schema/organizations";
import { usersTable } from "../schema/users";

// Migration 0022_platform_foundation. Every key to users is CASCADE (the row
// is that person's own data) or SET NULL (an actor column), and each one has
// an entry in the API's export-policy registry.

// Owner-granted platform capabilities. No role implies one, super_admin included.
export const platformGrantsTable = pgTable(
  "platform_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    source: text("source").notNull().default("grant"),
    reason: text("reason").notNull(),
    grantedBy: uuid("granted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("platform_grants_active_unique")
      .on(t.userId, t.capability)
      .where(sql`${t.revokedAt} IS NULL`),
    index("platform_grants_capability_idx")
      .on(t.capability)
      .where(sql`${t.revokedAt} IS NULL`),
    check(
      "platform_grants_capability_check",
      sql`${t.capability} IN ('skills.author','skills.publisher','skills.grader','skills.adjudicator','skills.integrity')`,
    ),
    check(
      "platform_grants_source_check",
      sql`${t.source} IN ('grant','break_glass')`,
    ),
    check(
      "platform_grants_reason_check",
      sql`char_length(${t.reason}) BETWEEN 3 AND 500`,
    ),
    // Nobody grants to themselves; the API refuses it first.
    check(
      "platform_grants_self_check",
      sql`${t.grantedBy} IS NULL OR ${t.grantedBy} <> ${t.userId}`,
    ),
  ],
);

// Organisation type and verification. A missing row means an unverified community.
export const organizationAccountsTable = pgTable(
  "organization_accounts",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("community"),
    verification: text("verification").notNull().default("unverified"),
    legalName: text("legal_name"),
    websiteDomain: text("website_domain"),
    verifiedDomains: jsonb("verified_domains")
      .$type<string[]>()
      .notNull()
      .default([]),
    domainProofDigest: text("domain_proof_digest"),
    // Reviewers only.
    evidenceNote: text("evidence_note"),
    requestedBy: uuid("requested_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("organization_accounts_legal_name_unique")
      .on(t.kind, sql`lower(${t.legalName})`)
      .where(sql`${t.verification} = 'verified'`),
    index("organization_accounts_kind_idx").on(t.kind, t.verification),
    check(
      "organization_accounts_kind_check",
      sql`${t.kind} IN ('company','college','community')`,
    ),
    check(
      "organization_accounts_verification_check",
      sql`${t.verification} IN ('unverified','pending','verified','rejected','suspended')`,
    ),
    check(
      "organization_accounts_evidence_check",
      sql`char_length(${t.evidenceNote}) <= 1000`,
    ),
    // verified_at, not verified_by, is the proof: the actor may be erased.
    check(
      "organization_accounts_verified_check",
      sql`${t.verification} <> 'verified' OR (${t.verifiedAt} IS NOT NULL AND ${t.legalName} IS NOT NULL AND ${t.kind} <> 'community')`,
    ),
  ],
);

// One organisation permission key given to a plain member.
export const organizationMemberGrantsTable = pgTable(
  "organization_member_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    grantedBy: uuid("granted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("organization_member_grants_active_unique")
      .on(t.organizationId, t.userId, t.capability)
      .where(sql`${t.revokedAt} IS NULL`),
    index("organization_member_grants_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
    check(
      "organization_member_grants_capability_check",
      sql`${t.capability} IN ('skills.organization.author','skills.organization.assign','skills.organization.results','skills.organization.grade','education.cohort.manage')`,
    ),
  ],
);

// A time-boxed right held by exactly one user or one organisation.
export const entitlementsTable = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    organizationId: uuid("organization_id").references(
      () => organizationsTable.id,
      { onDelete: "cascade" },
    ),
    feature: text("feature").notNull(),
    seats: integer("seats"),
    seatsUsed: integer("seats_used").notNull().default(0),
    limits: jsonb("limits").notNull().default({}),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    externalRef: text("external_ref"),
    grantedBy: uuid("granted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("entitlements_user_idx").on(t.userId, t.feature),
    index("entitlements_organization_idx").on(t.organizationId, t.feature),
    check(
      "entitlements_holder_check",
      sql`num_nonnulls(${t.userId}, ${t.organizationId}) = 1`,
    ),
    check(
      "entitlements_feature_check",
      sql`${t.feature} IN ('skills.premium','skills.seats','skills.org_authoring','education.cohorts')`,
    ),
    check("entitlements_seats_check", sql`${t.seats} > 0`),
    check("entitlements_seats_used_check", sql`${t.seatsUsed} >= 0`),
    // The conditional seat update relies on this as its last line of defence.
    check(
      "entitlements_seats_limit_check",
      sql`${t.seats} IS NULL OR ${t.seatsUsed} <= ${t.seats}`,
    ),
    check(
      "entitlements_seats_holder_check",
      sql`${t.seats} IS NULL OR ${t.organizationId} IS NOT NULL`,
    ),
    check("entitlements_window_check", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "entitlements_source_check",
      sql`${t.source} IN ('comp','invoice','purchase')`,
    ),
  ],
);

// One row per person who has used an entitlement, so a seat is counted once.
export const entitlementUsesTable = pgTable(
  "entitlement_uses",
  {
    entitlementId: uuid("entitlement_id")
      .notNull()
      .references(() => entitlementsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    firstUsedAt: timestamp("first_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "entitlement_uses_pk",
      columns: [t.entitlementId, t.userId],
    }),
  ],
);

// Deliberately no user key: queued work must survive account cascades.
// Personal data a job needs lives only in sealed_payload.
export const workJobsTable = pgTable(
  "work_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    refId: uuid("ref_id"),
    payload: jsonb("payload").notNull().default({}),
    sealedPayload: text("sealed_payload"),
    keyId: text("key_id"),
    state: text("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseId: uuid("lease_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("work_jobs_dedupe_unique").on(t.dedupeKey),
    index("work_jobs_queue_idx").on(t.state, t.availableAt, t.createdAt),
    index("work_jobs_lease_idx").on(t.state, t.leaseUntil),
    check("work_jobs_kind_check", sql`${t.kind} ~ '^[a-z][a-z0-9-]{2,40}$'`),
    check(
      "work_jobs_payload_check",
      sql`octet_length(${t.payload}::text) <= 8192`,
    ),
    check(
      "work_jobs_state_check",
      sql`${t.state} IN ('queued','running','done','failed','cancelled')`,
    ),
    check("work_jobs_attempts_check", sql`${t.attempts} BETWEEN 0 AND 5`),
  ],
);

// Replay guard for signed provider callbacks. No user key. Pruned after 7 days.
export const hookReceiptsTable = pgTable(
  "hook_receipts",
  {
    eventHash: text("event_hash").primaryKey(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("hook_receipts_source_check", sql`${t.source} IN ('video','mail')`),
    check(
      "hook_receipts_status_check",
      sql`${t.status} IN ('accepted','ignored')`,
    ),
  ],
);

// Addresses that must not be mailed, held as digests only. No user key.
export const mailSuppressionsTable = pgTable(
  "mail_suppressions",
  {
    emailDigest: text("email_digest").primaryKey(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "mail_suppressions_reason_check",
      sql`${t.reason} IN ('bounce','complaint','manual')`,
    ),
  ],
);

// Append-only hash chain. No user key and no foreign keys at all, so it
// survives account erasure: actor_ref is an HMAC pseudonym, never a user id,
// and payload holds ids, digests, codes and numbers only.
export const skillLedgerTable = pgTable(
  "skill_ledger",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    chain: text("chain").notNull(),
    seq: integer("seq").notNull(),
    prevHash: text("prev_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    type: text("type").notNull(),
    actorRef: text("actor_ref"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_ledger_entry_hash_unique").on(t.entryHash),
    uniqueIndex("skill_ledger_chain_seq_unique").on(t.chain, t.seq),
    check(
      "skill_ledger_chain_check",
      sql`${t.chain} ~ '^(access|content|grading|moderation|attempt:[0-9a-f-]{36})$'`,
    ),
    check("skill_ledger_seq_check", sql`${t.seq} > 0`),
    check(
      "skill_ledger_type_check",
      sql`${t.type} ~ '^[a-z][a-z0-9_.]{2,60}$'`,
    ),
    check(
      "skill_ledger_payload_check",
      sql`octet_length(${t.payload}::text) <= 8192`,
    ),
  ],
);

// Signed Merkle roots over the chain heads. No user key.
export const skillLedgerCheckpointsTable = pgTable(
  "skill_ledger_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    entriesThrough: bigint("entries_through", { mode: "number" }).notNull(),
    chainCount: integer("chain_count").notNull(),
    merkleRoot: text("merkle_root").notNull(),
    signature: text("signature").notNull(),
    keyId: text("key_id").notNull(),
    // Where the copy outside the database lives; null until it is written.
    anchorRef: text("anchor_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_ledger_checkpoints_entries_unique").on(t.entriesThrough),
  ],
);

// One row per provider call. No user key. Names avoid the word "token"
// because audit metadata rejects it.
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose").notNull(),
    scopeOrgId: uuid("scope_org_id").references(() => organizationsTable.id, {
      onDelete: "set null",
    }),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    inputUnits: bigint("input_units", { mode: "number" }).notNull().default(0),
    outputUnits: bigint("output_units", { mode: "number" })
      .notNull()
      .default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_usage_purpose_idx").on(t.purpose, t.startedAt),
    index("ai_usage_ref_idx").on(t.refType, t.refId),
    check(
      "ai_usage_purpose_check",
      sql`${t.purpose} IN ('grading','interview','transcription','speech','drafting','moderation','calibration','screening')`,
    ),
    check(
      "ai_usage_status_check",
      sql`${t.status} IN ('reserved','ok','failed','unknown')`,
    ),
  ],
);

// Reserve-then-settle money budgets in micro-USD. No user key.
export const aiBudgetsTable = pgTable(
  "ai_budgets",
  {
    scope: text("scope").notNull(),
    period: text("period").notNull(),
    limitMicros: bigint("limit_micros", { mode: "number" }).notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" })
      .notNull()
      .default(0),
    spentMicros: bigint("spent_micros", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ name: "ai_budgets_pk", columns: [t.scope, t.period] }),
    check(
      "ai_budgets_amounts_check",
      sql`${t.limitMicros} >= 0 AND ${t.reservedMicros} >= 0 AND ${t.spentMicros} >= 0`,
    ),
  ],
);
