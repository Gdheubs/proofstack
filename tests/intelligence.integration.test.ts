import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { pool } from "@workspace/db";
import {
  runIntelligenceAction,
  getIntelligence,
} from "../artifacts/api-server/src/services/intelligence-jobs";
import {
  claimIntelligenceJob,
  processIntelligenceJob,
  runIntelligenceOnce,
  pruneIntelligenceJobs,
} from "../artifacts/api-server/src/services/intelligence-worker";
import {
  runRepositoryAction,
  getRepositories,
} from "../artifacts/api-server/src/services/repositories";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
const provider = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../artifacts/api-server/src/services/intelligence-provider", () => ({
  requestLearningPlan: provider.call,
  estimateCostMicros: () => 123,
}));
const session = (id: string) =>
  ({
    user: { id },
    aal: "aal2",
    row: { last_mfa_at: new Date() },
    providerUser: { factors: [{ status: "verified", factor_type: "totp" }] },
  }) as AuthSession;
const req = { id: randomUUID() } as Parameters<typeof runIntelligenceAction>[0];
const users: string[] = [],
  org = randomUUID(),
  opportunity = randomUUID();
async function user() {
  const id = randomUUID();
  users.push(id);
  await pool.query(
    "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$1::text||'@example.test')",
    [id],
  );
  await pool.query(
    "INSERT INTO profiles(user_id,display_name,handle,skills) VALUES($1::uuid,'Fixture user',$1::text,'[\"TypeScript\",\"SQL\"]'::jsonb)",
    [id],
  );
  return id;
}
const act = (uid: string, d: unknown) =>
  runIntelligenceAction(req, session(uid), d);
const enqueue = (uid: string) =>
  act(uid, {
    action: "enqueue",
    kind: "opportunities",
    requestKey: randomUUID(),
    workplace: "any",
  });
const detail = (uid: string, id: string) => getIntelligence({ id }, uid);
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Durable private intelligence",
  () => {
    beforeAll(async () => {
      vi.stubEnv("INTELLIGENCE_ENABLED", "true");
      vi.stubEnv("INTELLIGENCE_AI_MODEL", "test-model");
      vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://provider.invalid");
      vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
      const creator = await user();
      await pool.query(
        "INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Fixture organization',$1::text)",
        [org],
      );
      await pool.query(
        "INSERT INTO community_organization_profiles(organization_id,visibility) VALUES($1,'public')",
        [org],
      );
      await pool.query(
        "INSERT INTO career_jobs(id,organization_id,creator_id,title,description,skills,kind,workplace,status) VALUES($1,$2,$3,'Developer','Build a project','[\"TypeScript\",\"Testing\"]'::jsonb,'job','remote','open')",
        [opportunity, org, creator],
      );
    });
    afterAll(async () => {
      await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      await pool.end();
      vi.unstubAllEnvs();
    });
    it("deduplicates submissions, isolates owners, filters closed jobs and retains quota after deletion", async () => {
      const uid = await user(),
        outsider = await user(),
        input = {
          action: "enqueue",
          kind: "opportunities",
          requestKey: randomUUID(),
          workplace: "any",
        };
      const first = await act(uid, input);
      expect((await act(uid, input)).id).toBe(first.id);
      expect((await getIntelligence({}, uid)).usedToday).toBe(1);
      await expect(
        act(uid, { ...input, workplace: "remote" }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(detail(outsider, first.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        act(outsider, { action: "cancel", id: first.id }),
      ).rejects.toMatchObject({ status: 404 });
      expect(await runIntelligenceOnce()).toBe(true);
      const result = (await detail(uid, first.id)).job!;
      expect(result.status).toBe("succeeded");
      expect(result.result!.matches[0].id).toBe(opportunity);
      expect((await getIntelligence({}, uid)).jobs[0].result).toBeNull();
      await pool.query("UPDATE career_jobs SET status='closed' WHERE id=$1", [
        opportunity,
      ]);
      expect((await detail(uid, first.id)).job!.result!.matches).toEqual([]);
      await pool.query("UPDATE career_jobs SET status='open' WHERE id=$1", [
        opportunity,
      ]);
      await act(uid, { action: "review", id: first.id });
      expect((await detail(uid, first.id)).job!.reviewedAt).not.toBeNull();
      await act(uid, { action: "delete", id: first.id });
      expect((await getIntelligence({}, uid)).usedToday).toBe(1);
      await pool.query(
        "UPDATE intelligence_budgets SET used=20 WHERE scope=$1",
        ["user:" + uid],
      );
      await expect(enqueue(uid)).rejects.toMatchObject({ status: 429 });
    });
    it("caps active work, fences cancelled and expired workers, recovers leases and expires abandoned work", async () => {
      const uid = await user(),
        a = await enqueue(uid),
        b = await enqueue(uid);
      await expect(enqueue(uid)).rejects.toMatchObject({ status: 429 });
      const claimed = await claimIntelligenceJob();
      expect(claimed?.id).toBe(a.id);
      await act(uid, { action: "cancel", id: a.id });
      await processIntelligenceJob(claimed!);
      expect((await detail(uid, a.id)).job!.status).toBe("cancelled");
      expect((await detail(uid, a.id)).job!.result).toBeNull();
      const second = await claimIntelligenceJob();
      expect(second?.id).toBe(b.id);
      await pool.query(
        "UPDATE intelligence_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
        [b.id],
      );
      expect(await claimIntelligenceJob()).toBeNull();
      await pool.query(
        "UPDATE intelligence_jobs SET available_at=now()-interval '1 second' WHERE id=$1",
        [b.id],
      );
      const recovered = await claimIntelligenceJob();
      expect(recovered!.lease_id).not.toBe(second!.lease_id);
      await processIntelligenceJob(second!);
      expect((await detail(uid, b.id)).job!.status).toBe("running");
      await processIntelligenceJob(recovered!);
      expect((await detail(uid, b.id)).job!.status).toBe("succeeded");
      const c = await enqueue(uid);
      await pool.query(
        "UPDATE intelligence_jobs SET created_at=now()-interval '25 hours' WHERE id=$1",
        [c.id],
      );
      expect(await claimIntelligenceJob()).toBeNull();
      expect((await detail(uid, c.id)).job!.status).toBe("failed");
      await pool.query(
        "UPDATE intelligence_jobs SET finished_at=now()-interval '31 days' WHERE user_id=$1",
        [uid],
      );
      await pruneIntelligenceJobs();
      expect((await getIntelligence({}, uid)).jobs).toEqual([]);
    });
    it("meters valid and invalid AI output, never retries ambiguous provider calls, and rechecks visibility", async () => {
      const uid = await user();
      const plan = () =>
        act(uid, {
          action: "enqueue",
          kind: "career-plan",
          requestKey: randomUUID(),
          jobId: opportunity,
          consent: true,
        });
      provider.call.mockResolvedValueOnce({
        raw: JSON.stringify({
          summary: "Practice plan",
          steps: [
            {
              title: "Test a project",
              objective: "Practice testing",
              exercise: "Write a small test suite",
              evidence: "A test report",
            },
          ],
        }),
        promptTokens: 100,
        completionTokens: 50,
      });
      const a = await plan();
      await runIntelligenceOnce();
      let job = (await detail(uid, a.id)).job!;
      expect(job.status).toBe("succeeded");
      expect(job.model).toBe("test-model");
      expect(job.promptTokens).toBe(100);
      expect(job.estimatedCostMicros).toBe(123);
      expect(provider.call.mock.calls[0][0]).toEqual(["TypeScript", "SQL"]);
      await pool.query(
        "UPDATE community_organization_profiles SET visibility='private' WHERE organization_id=$1",
        [org],
      );
      await expect(detail(uid, a.id)).rejects.toMatchObject({ status: 404 });
      await pool.query(
        "UPDATE community_organization_profiles SET visibility='public' WHERE organization_id=$1",
        [org],
      );
      provider.call.mockResolvedValueOnce({
        raw: "not valid JSON",
        promptTokens: 200,
        completionTokens: 80,
      });
      const b = await plan();
      await runIntelligenceOnce();
      job = (await detail(uid, b.id)).job!;
      expect(job.status).toBe("failed");
      expect(job.promptTokens).toBe(200);
      expect(job.result).toBeNull();
      const c = await plan();
      await claimIntelligenceJob();
      await pool.query(
        "UPDATE intelligence_jobs SET provider_started_at=now(),lease_until=now()-interval '1 second' WHERE id=$1",
        [c.id],
      );
      expect(await claimIntelligenceJob()).toBeNull();
      expect((await detail(uid, c.id)).job!.status).toBe("failed");
      expect(provider.call).toHaveBeenCalledTimes(2);
      await expect(plan()).rejects.toMatchObject({ status: 429 });
      expect((await getIntelligence({}, uid)).usedToday).toBe(3); // quota rollback on AI cap
    });
    it("keeps provider usage after in-flight cancellation without publishing the response", async () => {
      const uid = await user();
      const job = await act(uid, {
        action: "enqueue",
        kind: "career-plan",
        requestKey: randomUUID(),
        jobId: opportunity,
        consent: true,
      });
      provider.call.mockImplementationOnce(async () => {
        await act(uid, { action: "cancel", id: job.id });
        return {
          raw: JSON.stringify({
            summary: "Private draft",
            steps: [
              {
                title: "Practice",
                objective: "Learn",
                exercise: "Build",
                evidence: "Write notes",
              },
            ],
          }),
          promptTokens: 300,
          completionTokens: 60,
        };
      });
      await runIntelligenceOnce();
      const result = (await detail(uid, job.id)).job!;
      expect(result.status).toBe("cancelled");
      expect(result.result).toBeNull();
      expect(result.promptTokens).toBe(300);
      await expect(
        act(uid, { action: "delete", id: job.id }),
      ).rejects.toMatchObject({ status: 409 });
      await pool.query(
        "UPDATE intelligence_jobs SET provider_started_at=now()-interval '3 minutes' WHERE id=$1",
        [job.id],
      );
      await act(uid, { action: "delete", id: job.id });
      expect((await getIntelligence({}, uid)).aiUsedToday).toBe(1);
    });
    it("scans a pinned real Git commit privately, redacts credentials, and denies stale MFA or lost ownership", async () => {
      const uid = await user(),
        outsider = await user(),
        project = randomUUID(),
        root = await mkdtemp(join(tmpdir(), "proofstack-intelligence-"));
      vi.stubEnv("REPOSITORY_ROOT", root);
      try {
        await pool.query(
          "INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'Security fixture','Fixture')",
          [project, uid],
        );
        const repo = await runRepositoryAction(req, session(uid), {
          action: "create",
          projectId: project,
        });
        const first = (await getRepositories({ id: repo.id }, uid)).head;
        await runRepositoryAction(req, session(uid), {
          action: "branch",
          id: repo.id,
          branch: "review",
          from: "main",
          expectedHead: first,
        });
        const fake = "ghp_" + "B".repeat(36);
        await runRepositoryAction(req, session(uid), {
          action: "commit",
          id: repo.id,
          branch: "review",
          expectedHead: first,
          path: "test.ts",
          content: `const token = "${fake}";\neval(input);\n`,
          message: "Fixture",
        });
        const head = (
          await getRepositories({ id: repo.id, branch: "review" }, uid)
        ).head;
        const input = {
          action: "enqueue",
          kind: "security-scan",
          requestKey: randomUUID(),
          repositoryId: repo.id,
          branch: "review",
          expectedHead: head,
        };
        await expect(act(outsider, input)).rejects.toMatchObject({
          status: 404,
        });
        const stale = session(uid);
        stale.row.last_mfa_at = new Date(0);
        await expect(
          runIntelligenceAction(req, stale, input),
        ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
        await expect(
          act(uid, { ...input, expectedHead: first }),
        ).rejects.toMatchObject({ status: 409 });
        const scan = await act(uid, input);
        await runRepositoryAction(req, session(uid), {
          action: "commit",
          id: repo.id,
          branch: "review",
          expectedHead: head,
          path: "test.ts",
          content: "// cleared in a later commit\n",
          message: "Fix fixture",
        });
        await runIntelligenceOnce();
        const report = (await detail(uid, scan.id)).job!;
        expect(report.status).toBe("succeeded");
        expect(report.commit).toBe(head);
        expect(report.result!.findings.map((f) => f.rule)).toContain(
          "credential-token",
        );
        expect(JSON.stringify(report)).not.toContain(fake);
        await expect(detail(outsider, scan.id)).rejects.toMatchObject({
          status: 404,
        });
        const latest = (
          await getRepositories({ id: repo.id, branch: "review" }, uid)
        ).head;
        const pending = await act(uid, {
          ...input,
          requestKey: randomUUID(),
          expectedHead: latest,
        });
        await pool.query(
          "UPDATE community_projects SET owner_id=$2 WHERE id=$1",
          [project, outsider],
        );
        await runIntelligenceOnce();
        const deniedJob = (
          await pool.query(
            "SELECT status,result FROM intelligence_jobs WHERE id=$1",
            [pending.id],
          )
        ).rows[0];
        expect(deniedJob.status).toBe("failed");
        expect(deniedJob.result).toBeNull();
        await expect(detail(uid, scan.id)).rejects.toMatchObject({
          status: 404,
        });
        expect((await getIntelligence({}, uid)).jobs).toEqual([]);
        // Ownership change does not transfer someone else's private scan.
        await expect(detail(outsider, scan.id)).rejects.toMatchObject({
          status: 404,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);
