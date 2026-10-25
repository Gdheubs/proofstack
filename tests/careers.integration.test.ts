import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { pool } from "@workspace/db";
import { runCareerAction } from "../artifacts/api-server/src/services/careers-actions";
import { getCareers } from "../artifacts/api-server/src/services/careers-query";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const session = (id: string) =>
  ({
    user: { id },
    aal: "aal2",
    row: { last_mfa_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as AuthSession;
const req = { id: randomUUID() } as Parameters<typeof runCareerAction>[0];
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Evidence-based hiring and project work",
  () => {
    afterAll(async () => {
      await pool.end();
    });
    it("protects applications, enforces stage changes, hides private evidence and isolates project work", async () => {
      const [owner, candidate, outsider] = Array.from({ length: 3 }, () =>
        randomUUID(),
      );
      const org = randomUUID(),
        project = randomUUID();
      const act = (uid: string, data: unknown) =>
        runCareerAction(req, session(uid), data);
      try {
        await pool.query(
          `INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)`,
          [[owner, candidate, outsider]],
        );
        await pool.query(
          `INSERT INTO profiles(user_id,display_name,handle) SELECT id,'TEST career user','test_'||replace(id::text,'-','') FROM unnest($1::uuid[]) ids(id)`,
          [[owner, candidate, outsider]],
        );
        await pool.query(
          `INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'TEST hiring',$1::text)`,
          [org],
        );
        await pool.query(
          `INSERT INTO community_organization_profiles(organization_id) VALUES($1)`,
          [org],
        );
        await pool.query(
          `INSERT INTO organization_members(organization_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE key='organization_owner'`,
          [org, owner],
        );
        await pool.query(
          `INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'TEST evidence','Working example')`,
          [project, candidate],
        );
        const listing = {
          action: "job-save",
          organizationId: org,
          title: "TEST builder",
          description:
            "Build a useful product with a collaborative engineering team.",
          skills: ["TypeScript"],
          kind: "job",
          workplace: "remote",
          location: "Worldwide",
          compensation: "USD 80,000–100,000 / year",
          status: "draft",
        };
        await expect(act(outsider, listing)).rejects.toMatchObject({
          status: 403,
        });
        const stale = session(owner);
        stale.row.last_mfa_at = new Date(0);
        await expect(
          runCareerAction(req, stale, listing),
        ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
        const job = (await act(owner, listing)).id!;
        await expect(
          getCareers({ view: "job", id: job }, null),
        ).rejects.toMatchObject({ status: 404 });
        await act(owner, { ...listing, id: job, status: "open" });
        expect(
          (await getCareers({ view: "job", id: job }, null)).jobs[0]
            .applicationCount,
        ).toBe(0);
        const application = {
          action: "apply",
          jobId: job,
          note: "I built this project and can explain the implementation choices.",
          projectIds: [project],
        };
        await expect(act(outsider, application)).rejects.toMatchObject({
          status: 400,
        });
        const applied = (await act(candidate, application)).id!;
        await expect(act(candidate, application)).rejects.toMatchObject({
          code: "23505",
        });
        await expect(
          getCareers({ view: "application", id: applied }, outsider),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          getCareers({ view: "applications" }, null),
        ).rejects.toMatchObject({ status: 401 });
        expect(
          (await getCareers({ view: "applications", scope: "received" }, owner))
            .applications[0].projects[0].id,
        ).toBe(project);
        await expect(
          act(candidate, {
            action: "application-status",
            id: applied,
            status: "shortlisted",
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          act(owner, {
            action: "application-status",
            id: applied,
            status: "offered",
          }),
        ).rejects.toMatchObject({ status: 400 });
        await act(owner, {
          action: "application-status",
          id: applied,
          status: "reviewing",
        });
        await act(owner, {
          action: "message",
          id: applied,
          body: "Could you explain the testing approach?",
        });
        expect(
          (await getCareers({ view: "application", id: applied }, candidate))
            .messages,
        ).toHaveLength(1);
        await act(candidate, {
          action: "career-save",
          headline: "TEST building useful software",
          roles: ["Engineer"],
          availability: "open",
          discoverable: true,
          featuredProjects: [project],
        });
        expect(
          (await getCareers({ view: "talent", q: "TEST building" }, null))
            .candidates[0].projects,
        ).toHaveLength(1);
        // Directory filters: availability and one skill (case-insensitive).
        await pool.query(
          'UPDATE profiles SET skills=\'["TypeScript","SQL"]\'::jsonb WHERE user_id=$1',
          [candidate],
        );
        const talent = (filters: Record<string, string>) =>
          getCareers(
            { view: "talent", q: "TEST building", ...filters },
            null,
          ).then((d) => d.candidates.map((c) => c.id));
        expect(await talent({ availability: "open" })).toEqual([candidate]);
        expect(await talent({ availability: "exploring" })).toEqual([]);
        expect(await talent({ skill: "typescript" })).toEqual([candidate]);
        expect(await talent({ skill: "rust" })).toEqual([]);
        await expect(
          getCareers({ view: "talent", availability: "closed" }, null),
        ).rejects.toMatchObject({ status: 400 });
        await pool.query(
          `UPDATE community_projects SET visibility='private' WHERE id=$1`,
          [project],
        );
        expect(
          (await getCareers({ view: "application", id: applied }, owner))
            .applications[0].projects,
        ).toHaveLength(0);
        expect(
          (await getCareers({ view: "talent", q: "TEST building" }, null))
            .candidates[0].projects,
        ).toHaveLength(0);
        await expect(
          getCareers({ view: "project-work", projectId: project }, outsider),
        ).rejects.toMatchObject({ status: 404 });
        const task = {
          action: "issue-save",
          projectId: project,
          title: "Document acceptance criteria",
          description: "Attach a demo showing expected behavior",
          status: "open",
          assigneeId: candidate,
          evidenceUrl: "",
        };
        const taskId = (await act(candidate, task)).id!;
        expect(
          (
            await getCareers(
              { view: "project-work", projectId: project },
              candidate,
            )
          ).issues[0].id,
        ).toBe(taskId);
        await expect(
          act(outsider, { ...task, id: taskId, status: "done" }),
        ).rejects.toMatchObject({ status: 404 });
        await act(candidate, {
          ...task,
          id: taskId,
          status: "done",
          evidenceUrl: "https://example.com/demo",
        });
        await pool.query(
          "UPDATE community_projects SET visibility='public' WHERE id=$1",
          [project],
        );
        await pool.query(
          "INSERT INTO community_contributors(project_id,user_id,status) VALUES($1,$2,'active')",
          [project, outsider],
        );
        const ownTask = (
          await act(outsider, {
            ...task,
            assigneeId: outsider,
            title: "Contributor-owned task",
          })
        ).id!;
        await expect(
          act(outsider, { ...task, id: taskId, status: "done" }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          act(outsider, { ...task, id: ownTask, assigneeId: candidate }),
        ).rejects.toMatchObject({ status: 403 });
        await act(outsider, {
          ...task,
          id: ownTask,
          assigneeId: outsider,
          status: "done",
        });
        await pool.query(
          "UPDATE community_contributors SET status='pending' WHERE project_id=$1 AND user_id=$2",
          [project, outsider],
        );
        await expect(
          act(outsider, {
            ...task,
            id: ownTask,
            assigneeId: outsider,
            status: "open",
          }),
        ).rejects.toMatchObject({ status: 403 });
        await act(candidate, {
          action: "application-status",
          id: applied,
          status: "withdrawn",
        });
        await expect(
          act(owner, {
            action: "message",
            id: applied,
            body: "Cannot send now",
          }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
          act(owner, {
            action: "application-status",
            id: applied,
            status: "reviewing",
          }),
        ).rejects.toMatchObject({ status: 400 });
        await pool.query(
          `UPDATE organization_members SET status='inactive' WHERE organization_id=$1 AND user_id=$2`,
          [org, owner],
        );
        await expect(
          getCareers({ view: "application", id: applied }, owner),
        ).rejects.toMatchObject({ status: 404 });
        expect(
          (
            await pool.query(
              `SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id=ANY($1::uuid[]) AND action LIKE 'careers.%'`,
              [[owner, candidate]],
            )
          ).rows[0].n,
        ).toBeGreaterThan(8);
      } finally {
        await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
        await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
          [owner, candidate, outsider],
        ]);
      }
    });
  },
);
