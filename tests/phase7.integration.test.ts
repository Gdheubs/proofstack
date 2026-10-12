import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { CommunityReader } from "../artifacts/api-server/src/services/community-reader";
import { getCommunity } from "../artifacts/api-server/src/services/community-query";
import {
  getOperations,
  workerHeartbeat,
} from "../artifacts/api-server/src/services/operations";
import { claimIntelligenceJob } from "../artifacts/api-server/src/services/intelligence-worker";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Phase 7 access and performance",
  () => {
    afterAll(async () => {
      await pool.end();
      vi.unstubAllEnvs();
    });
    it("loads 21 complete project cards in four SQL queries and treats search injection as text", async () => {
      const owner = randomUUID(),
        contributor = randomUUID(),
        projects = Array.from({ length: 21 }, () => randomUUID());
      try {
        await pool.query(
          "INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)",
          [[owner, contributor]],
        );
        await pool.query(
          "INSERT INTO profiles(user_id,display_name,handle) SELECT id,'Phase7 user',id::text FROM unnest($1::uuid[]) ids(id)",
          [[owner, contributor]],
        );
        await pool.query(
          "INSERT INTO community_projects(id,owner_id,slug,title,description) SELECT id,$2,id::text,'TEST Phase7 project','Fixture' FROM unnest($1::uuid[]) ids(id)",
          [projects, owner],
        );
        await pool.query(
          "INSERT INTO community_contributors(project_id,user_id,status) SELECT id,$2,'active' FROM unnest($1::uuid[]) ids(id)",
          [projects, contributor],
        );
        await pool.query(
          'INSERT INTO community_entries(project_id,user_id,kind,data) SELECT id,$2,\'evidence\',\'{"title":"Fixture evidence","aiAssisted":false}\'::jsonb FROM unnest($1::uuid[]) ids(id)',
          [projects, contributor],
        );
        const query = vi.spyOn(pool, "query");
        let cards;
        try {
          cards = await new CommunityReader(contributor).projects(
            "p.id=ANY($2::uuid[])",
            [projects],
          );
          expect(query.mock.calls.length).toBe(4);
          console.info(
            `Project fixture: ${cards.length} cards in ${query.mock.calls.length} queries`,
          );
        } finally {
          query.mockRestore();
        }
        expect(cards).toHaveLength(21);
        for (const c of cards) {
          expect(c.canEdit).toBe(false);
          expect(c.canContribute).toBe(true);
          expect(c.entries[0].canEdit).toBe(true);
          expect(c.contributors[0].person.id).toBe(contributor);
        }
        await pool.query(
          "UPDATE community_projects SET visibility='private' WHERE id=ANY($1::uuid[])",
          [projects],
        );
        expect(
          await new CommunityReader(null).projects("p.id=ANY($2::uuid[])", [
            projects,
          ]),
        ).toEqual([]);
        const result = await getCommunity(
          { view: "search", type: "projects", q: "' OR 1=1 --" },
          null,
        );
        expect(result.projects).toEqual([]);
      } finally {
        await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
          [owner, contributor],
        ]);
      }
    });
    it("protects operations with fresh MFA and live admin/session grants, and reports worker liveness", async () => {
      const uid = randomUUID(),
        sid = randomUUID(),
        wid = randomUUID();
      const s = {
        user: { id: uid, platformRole: "super_admin" },
        row: { id: sid, last_mfa_at: new Date() },
        aal: "aal2",
        providerUser: {
          factors: [{ status: "verified", factor_type: "totp" }],
        },
      } as AuthSession;
      vi.stubEnv("INTELLIGENCE_ENABLED", "true");
      try {
        await pool.query(
          "INSERT INTO users(id,auth_subject,email,platform_role) VALUES($1::uuid,$1::text,$1::text||'@example.test','admin')",
          [uid],
        );
        await pool.query(
          "INSERT INTO sessions(id,user_id,provider_session_id,expires_at) VALUES($1::uuid,$2,$1::text,now()+interval '1 hour')",
          [sid, uid],
        );
        const before = await getOperations(s);
        expect(before.queue.workers).toBe(0);
        expect(before.alerts.join(" ")).toContain("heartbeat");
        await workerHeartbeat(wid);
        expect((await getOperations(s)).queue.workers).toBe(1);
        await pool.query(
          "UPDATE service_heartbeats SET last_seen_at=now()-interval '181 seconds' WHERE id=$1",
          [wid],
        );
        expect((await getOperations(s)).queue.workers).toBe(0);
        const stale = { ...s, row: { ...s.row, last_mfa_at: new Date(0) } };
        await expect(getOperations(stale)).rejects.toMatchObject({
          code: "MFA_STEP_UP_REQUIRED",
        });
        await pool.query(
          "UPDATE users SET platform_role='moderator' WHERE id=$1",
          [uid],
        );
        await expect(getOperations(s)).rejects.toMatchObject({ status: 403 });
        await pool.query("UPDATE users SET platform_role='admin' WHERE id=$1", [
          uid,
        ]);
        await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [
          sid,
        ]);
        await expect(getOperations(s)).rejects.toMatchObject({ status: 403 });
        vi.stubEnv("MAINTENANCE_MODE", "true");
        expect(await claimIntelligenceJob()).toBeNull();
      } finally {
        await pool.query("DELETE FROM service_heartbeats WHERE id=$1", [wid]);
        await pool.query("DELETE FROM users WHERE id=$1", [uid]);
        vi.unstubAllEnvs();
      }
    });
  },
);
