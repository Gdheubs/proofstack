import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import * as core from "@workspace/db/schema";
import * as modules from "../lib/db/src/modules";
import { checkReadiness } from "../artifacts/api-server/src/services/health";
import {
  EXPORT_BASELINE,
  EXPORT_POLICY,
  exportRule,
} from "../artifacts/api-server/src/services/export-policy";

const folder = fileURLToPath(new URL("../lib/db/drizzle/", import.meta.url));
const preflight = `${process.cwd()}/artifacts/api-server/scripts/preflight-schema.mjs`;
const migration = readFileSync(`${folder}0022_platform_foundation.sql`, "utf8");
type Snapshot = { id: string; prevId: string; tables: Record<string, unknown> };
const snapshot = (index: string) =>
  JSON.parse(
    readFileSync(`${folder}meta/${index}_snapshot.json`, "utf8"),
  ) as Snapshot;
const names = (value: Snapshot) =>
  Object.keys(value.tables)
    .map((key) => key.replace(/^public\./, ""))
    .sort();

const PLATFORM_TABLES = [
  "ai_budgets",
  "ai_usage",
  "entitlement_uses",
  "entitlements",
  "hook_receipts",
  "mail_suppressions",
  "organization_accounts",
  "organization_member_grants",
  "platform_grants",
  "skill_ledger",
  "skill_ledger_checkpoints",
  "work_jobs",
];
// Section 3.3 "no user key".
const NO_USER_KEY = [
  "skill_ledger",
  "skill_ledger_checkpoints",
  "work_jobs",
  "hook_receipts",
  "mail_suppressions",
  "ai_usage",
  "ai_budgets",
];
const ORGANIZATION_KEYS = [
  "education.cohort.manage",
  "skills.organization.assign",
  "skills.organization.author",
  "skills.organization.grade",
  "skills.organization.results",
];
// Every foreign key to users in migration 0022: c is CASCADE, n is SET NULL.
const USER_KEYS: Record<string, "c" | "n"> = {
  "entitlement_uses.user_id": "c",
  "entitlements.granted_by": "n",
  "entitlements.user_id": "c",
  "organization_accounts.requested_by": "n",
  "organization_accounts.verified_by": "n",
  "organization_member_grants.granted_by": "n",
  "organization_member_grants.user_id": "c",
  "platform_grants.granted_by": "n",
  "platform_grants.revoked_by": "n",
  "platform_grants.user_id": "c",
};
// Generated ids: nothing a caller sends can collide with them.
const SURROGATE_KEYS = [
  "ai_usage_pkey",
  "entitlements_pkey",
  "organization_member_grants_pkey",
  "platform_grants_pkey",
  "skill_ledger_checkpoints_pkey",
  "skill_ledger_pkey",
  "work_jobs_pkey",
];
// The SQL name of a drizzle table, without importing the ORM into tests.
const tableName = (table: unknown) =>
  (table as Record<symbol, string | undefined>)[Symbol.for("drizzle:Name")];
const insertInto = (table: string, columns: Record<string, string>) =>
  `INSERT INTO ${table}(${Object.keys(columns).join(",")}) VALUES(${Object.values(columns).join(",")})`;
const future = "now() + interval '30 days'";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "migration 0022_platform_foundation and the modules barrel",
  () => {
    // One transaction for the whole file, rolled back at the end: nothing is
    // left behind, including in tables that later refuse DELETE.
    const connect = () => pool.connect();
    let client: Awaited<ReturnType<typeof connect>>;
    const query = (text: string, values: unknown[] = []) =>
      client.query(text, values);
    let user: string, other: string, org: string, otherOrg: string;
    // Constraints that a test below saw the database enforce.
    const proven = new Set<string>();

    beforeAll(async () => {
      client = await connect();
      await query("BEGIN");
      user = await person();
      other = await person();
      org = await organization();
      otherOrg = await organization();
    });
    afterAll(async () => {
      await query("ROLLBACK");
      client.release();
      await pool.end();
    });

    async function person() {
      const id = randomUUID();
      await query("INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)", [
        id,
        `subject-${id}`,
        `${id}@example.test`,
      ]);
      return id;
    }
    async function organization() {
      const id = randomUUID();
      await query("INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)", [
        id,
        "Platform fixture",
        `platform-${id}`,
      ]);
      return id;
    }
    // Runs work inside a savepoint and undoes it, so a refused statement
    // leaves the surrounding transaction usable.
    async function rolledBack<T>(work: () => Promise<T>) {
      await query("SAVEPOINT scoped");
      try {
        return await work();
      } finally {
        await query("ROLLBACK TO SAVEPOINT scoped");
        await query("RELEASE SAVEPOINT scoped");
      }
    }
    // The database must refuse the statement with this exact constraint:
    // 23514 for a CHECK, 23505 for a unique index or primary key.
    async function refuses(
      constraint: string,
      text: string,
      values: unknown[] = [],
    ) {
      await rolledBack(() =>
        expect(query(text, values)).rejects.toMatchObject({
          code: constraint.endsWith("_check") ? "23514" : "23505",
          constraint,
        }),
      );
      proven.add(constraint);
    }
    const grant = (holder: string, by: string | null) =>
      query(
        `INSERT INTO platform_grants(user_id,capability,reason,granted_by)
         VALUES($1,'skills.author','Trusted author',$2) RETURNING id`,
        [holder, by],
      );

    it("keeps module tables out of the barrel the global schema guard reads", async () => {
      expect(Object.keys(modules).sort()).toEqual([
        "distribution",
        "media",
        "platform",
        "skillsAttempts",
        "skillsContent",
        "skillsGrading",
        "social",
      ]);
      expect(Object.values(modules.platform).map(tableName).sort()).toEqual(
        PLATFORM_TABLES,
      );
      const coreTables = Object.values(core).map(tableName);
      expect(
        PLATFORM_TABLES.filter((name) => coreTables.includes(name)),
      ).toEqual([]);
      // The readiness query names the 54 core tables and nothing else.
      let expected: string[] = [];
      expect(
        await checkReadiness(async (_text, values) => {
          expected = values[0] as string[];
          return { rows: [{ healthy: true }] };
        }),
      ).toMatchObject({ status: "ready" });
      expect([...new Set(expected)].sort()).toEqual(names(snapshot("0021")));
    });

    it("stays ready when every module table is absent", async () => {
      await rolledBack(async () => {
        await query(
          `DROP TABLE ${PLATFORM_TABLES.map((name) => `"${name}"`).join(",")} CASCADE`,
        );
        expect(
          (
            await query(
              "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
              [PLATFORM_TABLES],
            )
          ).rows,
        ).toEqual([{ n: 0 }]);
        expect(await checkReadiness(query)).toEqual({
          status: "ready",
          checks: { database: "ready" },
        });
      });
      expect(
        (
          await query(
            "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
            [PLATFORM_TABLES],
          )
        ).rows,
      ).toEqual([{ n: 12 }]);
    });

    it("generates one snapshot of 66 tables from both barrels and matches the migrated database", async () => {
      const latest = snapshot("0022");
      expect(latest.prevId).toBe(snapshot("0021").id);
      expect(names(latest)).toHaveLength(66);
      expect(names(latest)).toEqual(
        [...names(snapshot("0021")), ...PLATFORM_TABLES].sort(),
      );
      const { inspectProductSchema, inspectCommunityGrants } = await import(
        preflight
      );
      // No table count here: the inspector reads the latest snapshot, which
      // grows with each later migration. The count is pinned in two other
      // tests, which the integrator updates.
      expect(await inspectProductSchema(client)).toMatchObject({
        requiredProductSchema: true,
        requiredIndexes: true,
        requiredConstraints: true,
      });
      expect(await inspectCommunityGrants(client)).toBe(true);
    });

    it("stores migration files with LF line endings", () => {
      for (const file of [
        "0022_platform_foundation.sql",
        "meta/0022_snapshot.json",
        "meta/_journal.json",
      ])
        expect(readFileSync(`${folder}${file}`, "utf8")).not.toContain("\r");
      expect(
        readFileSync(
          fileURLToPath(new URL("../.gitattributes", import.meta.url)),
          "utf8",
        ),
      ).toMatch(/^lib\/db\/drizzle\/\*\* text eol=lf\r?$/m);
      // PGlite replays these files: no extensions, no concurrent index builds.
      expect(migration).not.toMatch(/CREATE EXTENSION|CONCURRENTLY/i);
    });

    it("seeds five organization permission keys for owners and admins only", async () => {
      const keys = await query(
        "SELECT key FROM permissions WHERE key=ANY($1::text[]) AND name<>'' ORDER BY key",
        [ORGANIZATION_KEYS],
      );
      expect(keys.rows.map((row) => row.key).sort()).toEqual(ORGANIZATION_KEYS);
      const grants = await query(
        `SELECT r.key AS role,p.key AS permission FROM role_permissions rp
         JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
         WHERE p.key=ANY($1::text[])`,
        [ORGANIZATION_KEYS],
      );
      expect(grants.rows).toHaveLength(10);
      expect(
        grants.rows.map((row) => `${row.role}:${row.permission}`).sort(),
      ).toEqual(
        ["organization_admin", "organization_owner"].flatMap((role) =>
          ORGANIZATION_KEYS.map((permission) => `${role}:${permission}`),
        ),
      );
      // A plain member keeps exactly what migration 0004 gave it.
      const member = await query(
        `SELECT p.key FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
         JOIN permissions p ON p.id=rp.permission_id WHERE r.key='organization_member'`,
      );
      expect(member.rows).toEqual([{ key: "community.organization.read" }]);
    });

    it("seeds definitions only and is safe to run again", async () => {
      const targets = [...migration.matchAll(/INSERT INTO\s+"?(\w+)/gi)].map(
        (match) => match[1],
      );
      expect(targets).toEqual(["permissions", "role_permissions"]);
      expect(migration).not.toContain("'organization_member'");
      const seeds = migration
        .split("--> statement-breakpoint")
        .filter((statement) => /INSERT INTO/i.test(statement));
      expect(seeds).toHaveLength(2);
      const count = async () =>
        (
          await query(
            `SELECT (SELECT count(*)::int FROM permissions) AS permissions,
              (SELECT count(*)::int FROM role_permissions) AS grants,
              (SELECT count(*)::int FROM roles) AS roles,
              (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM organization_members) AS members`,
          )
        ).rows[0];
      const before = await count();
      for (const statement of [...seeds, ...seeds]) await query(statement);
      expect(await count()).toEqual(before);
    });

    it("gives every foreign key to users CASCADE or SET NULL and an export rule", async () => {
      const keys = (
        await query(
          `SELECT c.conrelid::regclass::text AS "table",a.attname::text AS "column",c.confdeltype::text AS action
           FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
           WHERE c.contype='f' AND c.confrelid='public.users'::regclass`,
        )
      ).rows as { table: string; column: string; action: string }[];
      const platform = keys.filter((key) =>
        PLATFORM_TABLES.includes(key.table),
      );
      expect(
        Object.fromEntries(
          platform.map((key) => [`${key.table}.${key.column}`, key.action]),
        ),
      ).toEqual(USER_KEYS);
      // Only this migration's entries: later migrations add their own.
      expect(
        Object.keys(EXPORT_POLICY)
          .filter((key) => PLATFORM_TABLES.includes(key.split(".")[0]))
          .sort(),
      ).toEqual(Object.keys(USER_KEYS).sort());
      const columns = (
        await query(
          "SELECT table_name::text AS t,column_name::text AS c FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",
          [PLATFORM_TABLES],
        )
      ).rows.map((row) => `${row.t}.${row.c}`);
      for (const key of platform) {
        const rule = exportRule(key.table, key.column);
        expect(rule, `${key.table}.${key.column}`).toBeDefined();
        // An actor column leads to someone else's row: nothing is exported.
        expect(rule === "none", `${key.table}.${key.column}`).toBe(
          key.action === "n",
        );
        if (Array.isArray(rule)) {
          expect(rule.length).toBeGreaterThan(0);
          for (const column of rule) {
            expect(columns).toContain(`${key.table}.${column}`);
            // A listed column never carries a person's id.
            expect(Object.keys(USER_KEYS)).not.toContain(
              `${key.table}.${column}`,
            );
          }
        }
      }
      // The frozen baseline is exactly the user keys of the 54 earlier tables.
      const earlier = names(snapshot("0021"));
      expect(
        keys
          .filter((key) => earlier.includes(key.table))
          .map((key) => `${key.table}.${key.column}`)
          .sort(),
      ).toEqual([...EXPORT_BASELINE].sort());
      expect(EXPORT_BASELINE).toHaveLength(37);
      expect(Object.isFrozen(EXPORT_BASELINE)).toBe(true);
      expect(Object.isFrozen(EXPORT_POLICY)).toBe(true);
      // Frozen all the way down: a column list cannot be widened at runtime.
      for (const [key, rule] of Object.entries(EXPORT_POLICY))
        expect(typeof rule === "string" || Object.isFrozen(rule), key).toBe(
          true,
        );
      expect(() =>
        (exportRule("platform_grants", "user_id") as string[]).push(
          "granted_by",
        ),
      ).toThrow(TypeError);
      expect(exportRule("platform_grants", "user_id")).not.toContain(
        "granted_by",
      );
      for (const key of EXPORT_BASELINE) {
        const [table, column] = key.split(".");
        expect(exportRule(table, column)).toBe("full");
      }
      // Anything unclassified has no rule, so nothing is exported for it.
      expect(exportRule("skill_ledger", "actor_ref")).toBeUndefined();
      expect(exportRule("platform_grants", "id")).toBeUndefined();
    });

    it("keeps the ledger, queue, hook, mail and AI tables free of user keys", async () => {
      const found = await query(
        `SELECT c.conrelid::regclass::text AS "table",c.confrelid::regclass::text AS target
         FROM pg_constraint c WHERE c.contype='f' AND c.conrelid::regclass::text=ANY($1::text[])`,
        [NO_USER_KEY],
      );
      // The only foreign key among them points at organizations.
      expect(found.rows).toEqual([
        { table: "ai_usage", target: "organizations" },
      ]);
    });

    it("platform_grants: no self-grant, one active grant per capability, bounded values", async () => {
      const insert = (columns: Record<string, string>) =>
        insertInto("platform_grants", {
          user_id: "$1",
          capability: "'skills.grader'",
          reason: "'Trusted grader'",
          ...columns,
        });
      await refuses(
        "platform_grants_self_check",
        insert({ granted_by: "$1" }),
        [user],
      );
      const first = (await grant(user, other)).rows[0].id;
      // A break-glass grant has no granting user and is not a self-grant.
      await query(
        insert({ capability: "'skills.publisher'", source: "'break_glass'" }),
        [user],
      );
      await refuses(
        "platform_grants_active_unique",
        insert({ capability: "'skills.author'", granted_by: "$2" }),
        [user, other],
      );
      await refuses(
        "platform_grants_self_check",
        "UPDATE platform_grants SET granted_by=user_id WHERE id=$1",
        [first],
      );
      // Revoking frees the slot; the revoked row stays as history.
      await query(
        "UPDATE platform_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1",
        [first, other],
      );
      await grant(user, other);
      expect(
        (
          await query(
            "SELECT count(*)::int AS n FROM platform_grants WHERE user_id=$1 AND capability='skills.author'",
            [user],
          )
        ).rows,
      ).toEqual([{ n: 2 }]);
      // No capability is a role name, and an organization key is not one.
      for (const capability of [
        "'super_admin'",
        "'skills.organization.author'",
      ])
        await refuses(
          "platform_grants_capability_check",
          insert({ capability }),
          [other],
        );
      await refuses(
        "platform_grants_source_check",
        insert({ source: "'script'" }),
        [other],
      );
      for (const reason of ["'no'", "repeat('x',501)"])
        await refuses("platform_grants_reason_check", insert({ reason }), [
          other,
        ]);
      await query(insert({ reason: "repeat('x',500)" }), [other]);
    });

    it("organization_accounts: verification needs proof and a unique legal name per kind", async () => {
      const insert = (columns: Record<string, string>) =>
        insertInto("organization_accounts", {
          organization_id: "$1",
          ...columns,
        });
      const name = `Example Institute ${randomUUID()}`;
      const verified = {
        kind: "'college'",
        verification: "'verified'",
        legal_name: `'${name}'`,
        verified_at: "now()",
      };
      await refuses(
        "organization_accounts_kind_check",
        insert({ kind: "'school'" }),
        [org],
      );
      await refuses(
        "organization_accounts_verification_check",
        insert({ verification: "'approved'" }),
        [org],
      );
      await refuses(
        "organization_accounts_evidence_check",
        insert({ evidence_note: "repeat('x',1001)" }),
        [org],
      );
      for (const broken of [
        { ...verified, verified_at: "NULL" },
        { ...verified, legal_name: "NULL" },
        { ...verified, kind: "'community'" },
      ])
        await refuses("organization_accounts_verified_check", insert(broken), [
          org,
        ]);
      await query(insert(verified), [org]);
      await refuses("organization_accounts_pkey", insert({}), [org]);
      // Defaults: a new row is an unverified community.
      const third = await organization();
      await query(insert({}), [third]);
      expect(
        (
          await query(
            "SELECT kind,verification,verified_domains FROM organization_accounts WHERE organization_id=$1",
            [third],
          )
        ).rows,
      ).toEqual([
        { kind: "community", verification: "unverified", verified_domains: [] },
      ]);
      // The same name in another case is the same name.
      await refuses(
        "organization_accounts_legal_name_unique",
        insert({ ...verified, legal_name: `'${name.toUpperCase()}'` }),
        [otherOrg],
      );
      // A pending claim may repeat it; so may a verified company.
      await rolledBack(() =>
        query(
          insert({
            ...verified,
            verification: "'pending'",
            verified_at: "NULL",
          }),
          [otherOrg],
        ),
      );
      await query(insert({ ...verified, kind: "'company'" }), [otherOrg]);
      await refuses(
        "organization_accounts_verified_check",
        "UPDATE organization_accounts SET verified_at=NULL WHERE organization_id=$1",
        [org],
      );
    });

    it("organization_member_grants: organization keys only, one active grant each", async () => {
      const insert = (capability: string) =>
        `${insertInto("organization_member_grants", {
          organization_id: "$1",
          user_id: "$2",
          capability: `'${capability}'`,
          granted_by: "$3",
        })} RETURNING id`;
      for (const capability of [
        "skills.author",
        "community.organization.members",
      ])
        await refuses(
          "organization_member_grants_capability_check",
          insert(capability),
          [org, user, other],
        );
      const first = (
        await query(insert("skills.organization.assign"), [org, user, other])
      ).rows[0].id;
      await refuses(
        "organization_member_grants_active_unique",
        insert("skills.organization.assign"),
        [org, user, other],
      );
      // Another key, another organization and a re-grant after revocation pass.
      await query(insert("education.cohort.manage"), [org, user, other]);
      await query(insert("skills.organization.assign"), [
        otherOrg,
        user,
        other,
      ]);
      await query(
        "UPDATE organization_member_grants SET revoked_at=now() WHERE id=$1",
        [first],
      );
      await query(insert("skills.organization.assign"), [org, user, other]);
    });

    it("entitlements: one holder, a valid window and seats that cannot be oversubscribed", async () => {
      const insert = (columns: Record<string, string>) =>
        `${insertInto("entitlements", {
          feature: "'skills.seats'",
          ends_at: future,
          source: "'invoice'",
          ...columns,
        })} RETURNING id`;
      await refuses("entitlements_holder_check", insert({}));
      await refuses(
        "entitlements_holder_check",
        insert({ user_id: "$1", organization_id: "$2" }),
        [user, org],
      );
      await refuses(
        "entitlements_feature_check",
        insert({ organization_id: "$1", feature: "'skills.everything'" }),
        [org],
      );
      await refuses(
        "entitlements_seats_check",
        insert({ organization_id: "$1", seats: "0" }),
        [org],
      );
      await refuses(
        "entitlements_seats_used_check",
        insert({ organization_id: "$1", seats: "5", seats_used: "-1" }),
        [org],
      );
      await refuses(
        "entitlements_seats_limit_check",
        insert({ organization_id: "$1", seats: "5", seats_used: "6" }),
        [org],
      );
      await refuses(
        "entitlements_seats_holder_check",
        insert({ user_id: "$1", feature: "'skills.premium'", seats: "5" }),
        [user],
      );
      await refuses(
        "entitlements_window_check",
        insert({ organization_id: "$1", ends_at: "now() - interval '1 day'" }),
        [org],
      );
      await refuses(
        "entitlements_window_check",
        insert({
          organization_id: "$1",
          starts_at: "'2030-01-01'",
          ends_at: "'2030-01-01'",
        }),
        [org],
      );
      await refuses(
        "entitlements_source_check",
        insert({ organization_id: "$1", source: "'gift'" }),
        [org],
      );
      await query(insert({ user_id: "$1", feature: "'skills.premium'" }), [
        user,
      ]);
      const seats = (
        await query(insert({ organization_id: "$1", seats: "1" }), [org])
      ).rows[0].id;
      expect(
        (
          await query(
            "SELECT seats_used,limits FROM entitlements WHERE id=$1",
            [seats],
          )
        ).rows,
      ).toEqual([{ seats_used: 0, limits: {} }]);
      // The statement of section 2.1: a second claim finds no free seat.
      const claim = () =>
        query(
          "UPDATE entitlements SET seats_used=seats_used+1 WHERE id=$1 AND seats_used<seats RETURNING seats_used",
          [seats],
        );
      expect((await claim()).rows).toEqual([{ seats_used: 1 }]);
      expect((await claim()).rows).toEqual([]);
      // Without that condition the CHECK is the last line of defence.
      await refuses(
        "entitlements_seats_limit_check",
        "UPDATE entitlements SET seats_used=seats_used+1 WHERE id=$1",
        [seats],
      );
      const use = insertInto("entitlement_uses", {
        entitlement_id: "$1",
        user_id: "$2",
      });
      await query(use, [seats, user]);
      await refuses("entitlement_uses_pk", use, [seats, user]);
      await query(use, [seats, other]);
    });

    it("work_jobs: one job per dedupe key and bounded kind, payload, state and attempts", async () => {
      const key = `mail:${randomUUID()}`;
      const fresh = () => [`mail:${randomUUID()}`];
      const insert = (columns: Record<string, string>) =>
        insertInto("work_jobs", {
          kind: "'mail'",
          dedupe_key: "$1",
          ...columns,
        });
      await query(insert({}), [key]);
      expect(
        (
          await query(
            "SELECT state,attempts,payload FROM work_jobs WHERE dedupe_key=$1",
            [key],
          )
        ).rows,
      ).toEqual([{ state: "queued", attempts: 0, payload: {} }]);
      await refuses(
        "work_jobs_dedupe_unique",
        insert({ kind: "'retention'" }),
        [key],
      );
      // Enqueueing the same work again is a no-op.
      await query(`${insert({})} ON CONFLICT(dedupe_key) DO NOTHING`, [key]);
      for (const kind of ["'Mail'", "'ab'", "'mail job'", "repeat('a',42)"])
        await refuses("work_jobs_kind_check", insert({ kind }), fresh());
      await refuses(
        "work_jobs_payload_check",
        insert({ payload: "jsonb_build_object('x',repeat('x',8192))" }),
        fresh(),
      );
      await refuses(
        "work_jobs_state_check",
        insert({ state: "'succeeded'" }),
        fresh(),
      );
      await refuses(
        "work_jobs_attempts_check",
        insert({ attempts: "6" }),
        fresh(),
      );
      await refuses(
        "work_jobs_attempts_check",
        "UPDATE work_jobs SET attempts=-1 WHERE dedupe_key=$1",
        [key],
      );
      for (const kind of ["finalize", "grade-ai", "ledger-checkpoint"])
        await query(insert({ kind: `'${kind}'` }), fresh());
    });

    it("hook_receipts and mail_suppressions: a replayed event or address is refused", async () => {
      const receipt = (source: string, status: string) =>
        insertInto("hook_receipts", {
          event_hash: "$1",
          source: `'${source}'`,
          status: `'${status}'`,
        });
      const event = `hash-${randomUUID()}`;
      await query(receipt("mail", "accepted"), [event]);
      await refuses("hook_receipts_pkey", receipt("video", "ignored"), [event]);
      await refuses("hook_receipts_source_check", receipt("sms", "accepted"), [
        `hash-${randomUUID()}`,
      ]);
      await refuses("hook_receipts_status_check", receipt("mail", "failed"), [
        `hash-${randomUUID()}`,
      ]);
      const suppression = (reason: string) =>
        insertInto("mail_suppressions", {
          email_digest: "$1",
          reason: `'${reason}'`,
        });
      const digest = `digest-${randomUUID()}`;
      await query(suppression("bounce"), [digest]);
      await refuses("mail_suppressions_pkey", suppression("manual"), [digest]);
      await refuses(
        "mail_suppressions_reason_check",
        suppression("unsubscribe"),
        [`digest-${randomUUID()}`],
      );
    });

    it("skill_ledger: one entry per chain position, known chains and bounded payloads", async () => {
      const chain = `attempt:${randomUUID()}`;
      const hash = () => `hash-${randomUUID()}`;
      const insert = (columns: Record<string, string> = {}) =>
        insertInto("skill_ledger", {
          chain: "$1",
          seq: "$2",
          prev_hash: "'0'",
          entry_hash: "$3",
          type: "'grant.created'",
          payload: `'{"n":1}'`,
          ...columns,
        });
      const first = hash();
      await query(insert(), [chain, 1, first]);
      await query(insert(), [chain, 2, hash()]);
      await refuses("skill_ledger_chain_seq_unique", insert(), [
        chain,
        2,
        hash(),
      ]);
      await refuses("skill_ledger_entry_hash_unique", insert(), [
        chain,
        3,
        first,
      ]);
      // The four named chains are accepted; nothing else is a chain.
      await rolledBack(async () => {
        for (const named of ["access", "content", "grading", "moderation"])
          await query(insert(), [named, 2_000_000_000, hash()]);
      });
      for (const bad of ["users", "Access", "attempt:1234", `${chain}0`])
        await refuses("skill_ledger_chain_check", insert(), [bad, 1, hash()]);
      for (const seq of [0, -1])
        await refuses("skill_ledger_seq_check", insert(), [chain, seq, hash()]);
      for (const type of ["'Grant'", "'ab'", "'grant created'"])
        await refuses("skill_ledger_type_check", insert({ type }), [
          chain,
          9,
          hash(),
        ]);
      await refuses(
        "skill_ledger_payload_check",
        insert({ payload: "jsonb_build_object('x',repeat('x',8192))" }),
        [chain, 9, hash()],
      );
      // The id is generated; a caller cannot choose a position in the table.
      await rolledBack(() =>
        expect(
          query(insert({ id: "1" }), [chain, 9, hash()]),
        ).rejects.toMatchObject({ code: "428C9" }),
      );
      const checkpoint = insertInto("skill_ledger_checkpoints", {
        entries_through: "$1",
        chain_count: "2",
        merkle_root: "'root'",
        signature: "'signature'",
        key_id: "'k1'",
      });
      const through = 9_000_000_000_000 + Math.floor(Math.random() * 1e9);
      await query(checkpoint, [through]);
      await refuses("skill_ledger_checkpoints_entries_unique", checkpoint, [
        through,
      ]);
    });

    it("ai_usage and ai_budgets: known purposes and states, and no negative money", async () => {
      const usage = (purpose: string, status: string) =>
        `${insertInto("ai_usage", {
          purpose: `'${purpose}'`,
          status: `'${status}'`,
          scope_org_id: "$1",
        })} RETURNING input_units::int,output_units::int,cost_micros::int`;
      expect((await query(usage("grading", "reserved"), [org])).rows).toEqual([
        { input_units: 0, output_units: 0, cost_micros: 0 },
      ]);
      await refuses("ai_usage_purpose_check", usage("chat", "ok"), [org]);
      await refuses("ai_usage_status_check", usage("grading", "done"), [org]);
      const scope = `org:${randomUUID()}`;
      const budget = (values: string) =>
        `INSERT INTO ai_budgets(scope,period,limit_micros,reserved_micros,spent_micros) VALUES($1,'2026-11',${values})`;
      await query(budget("1000,0,0"), [scope]);
      await refuses("ai_budgets_pk", budget("5,0,0"), [scope]);
      for (const values of ["-1,0,0", "1000,-1,0", "1000,0,-1"])
        await refuses("ai_budgets_amounts_check", budget(values), [
          `org:${randomUUID()}`,
        ]);
      await refuses(
        "ai_budgets_amounts_check",
        "UPDATE ai_budgets SET reserved_micros=reserved_micros-1 WHERE scope=$1",
        [scope],
      );
    });

    it("erasing a person removes their own rows and only clears their name from others", async () => {
      await rolledBack(async () => {
        const holder = await person();
        const actor = await person();
        const home = await organization();
        const granted = (await grant(holder, actor)).rows[0].id;
        await query(
          "UPDATE platform_grants SET revoked_at=now(),revoked_by=$2 WHERE id=$1",
          [granted, actor],
        );
        await query(
          `INSERT INTO organization_accounts(organization_id,kind,verification,legal_name,requested_by,requested_at,verified_by,verified_at)
           VALUES($1,'company','verified',$2,$3,now(),$3,now())`,
          [home, `Erasure ${home}`, actor],
        );
        await query(
          "INSERT INTO organization_member_grants(organization_id,user_id,capability,granted_by) VALUES($1,$2,'skills.organization.grade',$3)",
          [home, holder, actor],
        );
        await query(
          `INSERT INTO entitlements(user_id,feature,ends_at,source,granted_by) VALUES($1,'skills.premium',${future},'comp',$2)`,
          [holder, actor],
        );
        const seats = (
          await query(
            `INSERT INTO entitlements(organization_id,feature,seats,seats_used,ends_at,source,granted_by)
             VALUES($1,'skills.seats',3,1,${future},'invoice',$2) RETURNING id`,
            [home, actor],
          )
        ).rows[0].id;
        await query(
          "INSERT INTO entitlement_uses(entitlement_id,user_id) VALUES($1,$2)",
          [seats, holder],
        );
        const usage = (
          await query(
            "INSERT INTO ai_usage(purpose,status,scope_org_id) VALUES('drafting','ok',$1) RETURNING id",
            [home],
          )
        ).rows[0].id;
        const state = async () =>
          (
            await query(
              `SELECT
                (SELECT count(*)::int FROM platform_grants WHERE user_id=$1) AS grants,
                (SELECT count(*)::int FROM platform_grants WHERE user_id=$1 AND (granted_by IS NOT NULL OR revoked_by IS NOT NULL)) AS grant_actors,
                (SELECT count(*)::int FROM organization_member_grants WHERE organization_id=$2) AS member_grants,
                (SELECT count(*)::int FROM organization_member_grants WHERE organization_id=$2 AND granted_by IS NOT NULL) AS member_actors,
                (SELECT count(*)::int FROM entitlements WHERE user_id=$1) AS own_entitlements,
                (SELECT count(*)::int FROM entitlements WHERE organization_id=$2) AS org_entitlements,
                (SELECT count(*)::int FROM entitlements WHERE granted_by IS NOT NULL AND (user_id=$1 OR organization_id=$2)) AS entitlement_actors,
                (SELECT count(*)::int FROM entitlement_uses WHERE entitlement_id=$3) AS uses,
                (SELECT count(*)::int FROM organization_accounts WHERE organization_id=$2 AND verification='verified') AS verified,
                (SELECT count(*)::int FROM organization_accounts WHERE organization_id=$2 AND (requested_by IS NOT NULL OR verified_by IS NOT NULL)) AS account_actors,
                (SELECT count(*)::int FROM ai_usage WHERE id=$4) AS usage,
                (SELECT count(*)::int FROM ai_usage WHERE id=$4 AND scope_org_id IS NOT NULL) AS usage_scoped`,
              [holder, home, seats, usage],
            )
          ).rows[0];
        const full = {
          grants: 1,
          grant_actors: 1,
          member_grants: 1,
          member_actors: 1,
          own_entitlements: 1,
          org_entitlements: 1,
          entitlement_actors: 2,
          uses: 1,
          verified: 1,
          account_actors: 1,
          usage: 1,
          usage_scoped: 1,
        };
        expect(await state()).toEqual(full);
        // The actor goes: every row stays, with the actor columns cleared.
        // The verified organization stays verified, on verified_at alone.
        await query("DELETE FROM users WHERE id=$1", [actor]);
        const cleared = {
          ...full,
          grant_actors: 0,
          member_actors: 0,
          entitlement_actors: 0,
          account_actors: 0,
        };
        expect(await state()).toEqual(cleared);
        // The holder goes: their grants, entitlement and seat use go too.
        await query("DELETE FROM users WHERE id=$1", [holder]);
        const erased = {
          ...cleared,
          grants: 0,
          member_grants: 0,
          own_entitlements: 0,
          uses: 0,
        };
        expect(await state()).toEqual(erased);
        // The organization goes: its account and entitlements go; usage
        // records stay for the budget, no longer tied to it.
        await query("DELETE FROM organizations WHERE id=$1", [home]);
        expect(await state()).toEqual({
          ...erased,
          org_entitlements: 0,
          verified: 0,
          usage_scoped: 0,
        });
      });
    });

    // Runs last: the tests above record each constraint they saw refuse a
    // statement, and the catalog says which constraints exist.
    it("has asserted every CHECK and every unique index of the twelve tables", async () => {
      const found = await query(
        `SELECT c.conname::text AS name FROM pg_constraint c
         WHERE c.contype='c' AND c.conrelid::regclass::text=ANY($1::text[])
         UNION SELECT i.indexrelid::regclass::text FROM pg_index i
         WHERE i.indisunique AND i.indrelid::regclass::text=ANY($1::text[])`,
        [PLATFORM_TABLES],
      );
      const existing = found.rows.map((row) => row.name as string).sort();
      expect(existing).toHaveLength(50);
      expect(existing.filter((name) => !SURROGATE_KEYS.includes(name))).toEqual(
        [...proven].sort(),
      );
    });
  },
);
