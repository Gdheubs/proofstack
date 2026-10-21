import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import type { AssessmentAttempt } from "../artifacts/proofstack/lib/assessment-types";
const identity = vi.hoisted(() => ({
  uid: null as string | null,
  recoveryRequired: false,
}));
// Only the external verified identity boundary is faked; all application SQL and CSRF are real.
vi.mock(
  "../artifacts/api-server/src/services/auth-sessions",
  async (original) => ({
    ...(await original<
      typeof import("../artifacts/api-server/src/services/auth-sessions")
    >()),
    readSession: async () =>
      identity.uid
        ? ({
            user: {
              id: identity.uid,
              mfaRecoveryRequired: identity.recoveryRequired,
            },
            mfaRequired: false,
          } as AuthSession)
        : null,
  }),
);
import app from "../artifacts/api-server/src/app";
import { signedNonce } from "../artifacts/api-server/src/lib/auth-crypto";
let owner: string, outsider: string, handle: string;
const post = (path: string, body: unknown) => {
  const token = signedNonce();
  return request(app)
    .post(path)
    .set("Origin", "https://assessment.example.test")
    .set("Cookie", `__Host-ps-csrf=${token}`)
    .set("X-CSRF-Token", token)
    .send(body as object);
};
const start = async (assessmentId = "javascript-foundations") => {
  const response = await post("/api/assessments/start", { assessmentId });
  expect(response.status).toBe(200);
  return response.body as AssessmentAttempt;
};
type KeyQuestion = {
  id: string;
  topic: string;
  correctOptionId: string;
  options: { id: string }[];
};
// Graders' view of an attempt: the stored snapshot, including the answer key.
const key = async (attemptId: string) =>
  (
    await pool.query("SELECT snapshot FROM assessment_attempts WHERE id=$1", [
      attemptId,
    ])
  ).rows[0].snapshot.questions as KeyQuestion[];
const answersFor = async (attempt: AssessmentAttempt, correct = Infinity) =>
  Object.fromEntries(
    (await key(attempt.id)).map((q, i) => [
      q.id,
      i < correct
        ? q.correctOptionId
        : q.options.find((o) => o.id !== q.correctOptionId)!.id,
    ]),
  );
// Moves completed attempts past the retake cooldown.
const allowRetake = () =>
  pool.query(
    "UPDATE assessment_attempts SET completed_at=completed_at-interval '25 hours' WHERE user_id=$1 AND completed_at IS NOT NULL",
    [owner],
  );
beforeEach(async () => {
  process.env.AUTH_APP_ORIGIN = "https://assessment.example.test";
  process.env.SESSION_SECRET =
    "assessment-test-only-secret-at-least-32-characters";
  identity.recoveryRequired = false;
  await pool.query("DELETE FROM rate_limit_buckets");
  owner = randomUUID();
  outsider = randomUUID();
  handle = `test_${owner.replaceAll("-", "")}`;
  await pool.query(
    `INSERT INTO users(id,auth_subject,email) SELECT id,id::text,id::text||'@example.test' FROM unnest($1::uuid[]) ids(id)`,
    [[owner, outsider]],
  );
  await pool.query(
    `INSERT INTO profiles(user_id,display_name,handle) VALUES($1,'Skill check owner',$2),($3,'Other user',NULL)`,
    [owner, handle, outsider],
  );
  identity.uid = owner;
});
afterEach(async () => {
  identity.uid = null;
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, outsider],
  ]);
});
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "Platform skill checks (tracked migrations, embedded PostgreSQL)",
  () => {
    it("does not expose another user's attempt or allow another user to submit it", async () => {
      const attempt = await start();
      identity.uid = outsider;
      expect(
        (await request(app).get(`/api/assessments/attempts/${attempt.id}`))
          .status,
      ).toBe(404);
      const response = await post(
        `/api/assessments/attempts/${attempt.id}/submit`,
        {
          answers: Object.fromEntries(
            attempt.questions.map((q) => [q.id, "a"]),
          ),
        },
      );
      expect(response.status).toBe(404);
      expect(
        (
          await pool.query(
            "SELECT completed_at FROM assessment_attempts WHERE id=$1",
            [attempt.id],
          )
        ).rows[0].completed_at,
      ).toBeNull();
    });
    it("enforces authentication, account security and CSRF on assessment writes", async () => {
      const attempt = await start();
      identity.uid = null;
      expect(
        (
          await post("/api/assessments/start", {
            assessmentId: "javascript-foundations",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await post(`/api/assessments/attempts/${attempt.id}/submit`, {
            answers: {},
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/assessments/attempts/${attempt.id}`)
            .set("X-User-ID", owner)
        ).status,
      ).toBe(401);
      expect(
        (await request(app).get("/api/assessments/results?handle=me")).status,
      ).toBe(401);
      identity.uid = owner;
      identity.recoveryRequired = true;
      expect(
        (
          await post("/api/assessments/start", {
            assessmentId: "javascript-foundations",
          })
        ).status,
      ).toBe(403);
      expect(
        (await request(app).get(`/api/assessments/attempts/${attempt.id}`))
          .status,
      ).toBe(403);
      identity.recoveryRequired = false;
      for (const path of [
        "/api/assessments/start",
        `/api/assessments/attempts/${attempt.id}/submit`,
      ]) {
        const response = await request(app).post(path).send({ answers: {} });
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("CSRF_REJECTED");
        const token = signedNonce();
        const mismatch = await request(app)
          .post(path)
          .set("Origin", "https://assessment.example.test")
          .set("Cookie", `__Host-ps-csrf=${token}`)
          .set("X-CSRF-Token", signedNonce())
          .send({ answers: {} });
        expect(mismatch.status).toBe(403);
        const crossSite = await request(app)
          .post(path)
          .set("Origin", "https://evil.example.test")
          .set("Cookie", `__Host-ps-csrf=${token}`)
          .set("X-CSRF-Token", token)
          .send({ answers: {} });
        expect(crossSite.status).toBe(403);
      }
    });
    it("matches existing profile visibility including unpublished and disabled profiles", async () => {
      const attempt = await start();
      await post(`/api/assessments/attempts/${attempt.id}/submit`, {
        answers: await answersFor(attempt),
      });
      await pool.query("UPDATE profiles SET handle=NULL WHERE user_id=$1", [
        owner,
      ]);
      const own = await request(app).get("/api/assessments/results?handle=me");
      expect(own.status).toBe(200);
      expect(own.body.results).toHaveLength(1);
      identity.uid = outsider;
      expect(
        (await request(app).get("/api/assessments/results").query({ handle }))
          .status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .get("/api/assessments/results")
            .query({ userId: owner })
        ).status,
      ).toBe(400);
      identity.uid = null;
      expect(
        (await request(app).get("/api/assessments/results").query({ handle }))
          .status,
      ).toBe(404);
      await pool.query("UPDATE profiles SET handle=$2 WHERE user_id=$1", [
        owner,
        handle,
      ]);
      await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
        owner,
      ]);
      expect(
        (await request(app).get("/api/assessments/results").query({ handle }))
          .status,
      ).toBe(404);
    });
    it("rate-limits start and submit using separate account budgets", async () => {
      const attempt = await start();
      await pool.query(
        "UPDATE rate_limit_buckets SET hits=20 WHERE key LIKE 'auth:id:assessment-start:%'",
      );
      const blocked = await post("/api/assessments/start", {
        assessmentId: "javascript-foundations",
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("AUTH_RATE_LIMITED");
      const invalid = await post(
        `/api/assessments/attempts/${attempt.id}/submit`,
        { answers: {} },
      );
      expect(invalid.status).toBe(400);
      await pool.query(
        "UPDATE rate_limit_buckets SET hits=30 WHERE key LIKE 'auth:id:assessment-submit:%'",
      );
      expect(
        (
          await post(`/api/assessments/attempts/${attempt.id}/submit`, {
            answers: {},
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await pool.query(
            "SELECT completed_at FROM assessment_attempts WHERE id=$1",
            [attempt.id],
          )
        ).rows[0].completed_at,
      ).toBeNull();
    });
    it("rejects invalid start requests and malformed attempt identifiers without database writes", async () => {
      for (const body of [
        {},
        { assessmentId: 4 },
        { assessmentId: "" },
        { assessmentId: "javascript-foundations", userId: outsider },
        { assessmentId: "javascript-foundations", score: 100 },
      ]) {
        expect((await post("/api/assessments/start", body)).status).toBe(400);
      }
      expect(
        (
          await post("/api/assessments/start", {
            assessmentId: "missing-check",
          })
        ).status,
      ).toBe(404);
      for (const id of ["not-a-uuid", "1;DELETE FROM users", randomUUID()]) {
        const expected = id.length === 36 ? 404 : 400;
        expect(
          (
            await request(app).get(
              `/api/assessments/attempts/${encodeURIComponent(id)}`,
            )
          ).status,
        ).toBe(expected);
        expect(
          (
            await post(
              `/api/assessments/attempts/${encodeURIComponent(id)}/submit`,
              { answers: {} },
            )
          ).status,
        ).toBe(expected);
      }
      expect(
        (
          await pool.query(
            "SELECT count(*)::int n FROM assessment_attempts WHERE user_id=$1",
            [owner],
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("uses the stored question version and snapshot when resuming and grading", async () => {
      const attempt = await start();
      const row = (
        await pool.query(
          "SELECT snapshot FROM assessment_attempts WHERE id=$1",
          [attempt.id],
        )
      ).rows[0];
      row.snapshot.title = "Earlier question version";
      const first = row.snapshot.questions[0];
      first.correctOptionId = first.options.find(
        (o: { id: string }) => o.id !== first.correctOptionId,
      ).id;
      await pool.query(
        "UPDATE assessment_attempts SET snapshot=$2::jsonb,question_version=2 WHERE id=$1",
        [attempt.id, JSON.stringify(row.snapshot)],
      );
      const resumed = await start();
      expect(resumed.id).toBe(attempt.id);
      expect(resumed.title).toBe("Earlier question version");
      const response = await post(
        `/api/assessments/attempts/${attempt.id}/submit`,
        { answers: await answersFor(attempt) },
      );
      expect(response.status).toBe(200);
      expect(response.body.result.score).toBe(100);
      expect(response.body.result.title).toBe("Earlier question version");
    });
    it("database constraints reject incomplete result persistence and duplicate open attempts", async () => {
      const attempt = await start();
      await expect(
        pool.query(
          "UPDATE assessment_attempts SET completed_at=now() WHERE id=$1",
          [attempt.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        pool.query(
          "INSERT INTO assessment_attempts(user_id,assessment_id,question_version,snapshot) SELECT user_id,assessment_id,question_version,snapshot FROM assessment_attempts WHERE id=$1",
          [attempt.id],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      const response = await request(app).get(
        "/api/assessments/results?handle=me",
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ results: [] });
    });
    it("lists only the latest completed result per assessment for owners and public profiles", async () => {
      const old = await start();
      await post(`/api/assessments/attempts/${old.id}/submit`, {
        answers: await answersFor(old, 0),
      });
      await allowRetake();
      const latest = await start();
      const completed = await post(
        `/api/assessments/attempts/${latest.id}/submit`,
        { answers: await answersFor(latest) },
      );
      expect(completed.body.result.attempt).toBe(2);
      const accessibility = await start("web-accessibility");
      const second = await post(
        `/api/assessments/attempts/${accessibility.id}/submit`,
        { answers: await answersFor(accessibility) },
      );
      await allowRetake();
      await start(); // A newer incomplete attempt must not replace a completed result.
      const response = await request(app).get(
        "/api/assessments/results?handle=me",
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        results: [
          { ...second.body.result, attempts: 1 },
          { ...completed.body.result, attempts: 2 },
        ],
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /snapshot|answers|questions|user_id|correctOptionId/,
      );
      identity.uid = null;
      const publicResult = await request(app)
        .get("/api/assessments/results")
        .query({ handle });
      expect(publicResult.status).toBe(200);
      expect(publicResult.body).toEqual(response.body);
    });
    it.each([
      [0, 0, "Foundations need practice"],
      [5, 63, "Developing foundations demonstrated"],
      [8, 100, "Strong foundations demonstrated"],
    ] as const)(
      "reports honest skill-check feedback for %i correct answers",
      async (correct, score, prefix) => {
        const attempt = await start("web-accessibility");
        const response = await post(
          `/api/assessments/attempts/${attempt.id}/submit`,
          { answers: await answersFor(attempt, correct) },
        );
        expect(response.status).toBe(200);
        expect(response.body.result.score).toBe(score);
        expect(response.body.result.correct).toBe(correct);
        expect(response.body.result.remark).toBe(
          `${prefix} in this self-directed platform skill check; not proctored or expert verification.`,
        );
      },
    );
    it("never regrades a submitted attempt even when the answers change", async () => {
      const attempt = await start();
      const answers = await answersFor(attempt);
      const first = await post(
        `/api/assessments/attempts/${attempt.id}/submit`,
        { answers },
      );
      expect(first.status).toBe(200);
      for (const options of [answers, await answersFor(attempt, 0)]) {
        const retry = await post(
          `/api/assessments/attempts/${attempt.id}/submit`,
          { answers: options },
        );
        expect(retry.status).toBe(409);
        expect(retry.body.error.code).toBe("ASSESSMENT_ALREADY_COMPLETED");
      }
      expect(
        (await request(app).get(`/api/assessments/attempts/${attempt.id}`))
          .body,
      ).toEqual(first.body);
      const cooling = await post("/api/assessments/start", {
        assessmentId: "javascript-foundations",
      });
      expect(cooling.status).toBe(429);
      expect(cooling.body.error.code).toBe("ASSESSMENT_COOLDOWN");
      await allowRetake();
      expect((await start()).id).not.toBe(attempt.id);
    });
    type Answers = Record<string, string>;
    const firstOnly = (a: Answers) =>
      Object.fromEntries(Object.entries(a).slice(0, 1));
    const unknownOption = (a: Answers) => {
      const [id] = Object.keys(a);
      return { ...a, [id!]: "not-an-option" };
    };
    it.each([
      () => ({ answers: {} }),
      (a: Answers) => ({ answers: firstOnly(a) }),
      (a: Answers) => ({ answers: unknownOption(a) }),
      (a: Answers) => ({ answers: { ...a, extra: "a" } }),
      (a: Answers) => ({ answers: a, score: 100 }),
      (a: Answers) => ({ answers: a, userId: "forged" }),
      () => ({ answers: [] }),
      () => ({ answers: null }),
      (a: Answers) => ({ answers: { [Object.keys(a)[0]!]: 2 } }),
    ])(
      "rejects incomplete, invalid or client-graded submission %# without saving",
      async (build) => {
        const attempt = await start();
        const response = await post(
          `/api/assessments/attempts/${attempt.id}/submit`,
          build(await answersFor(attempt)),
        );
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("INVALID_ASSESSMENT_INPUT");
        const row = (
          await pool.query(
            "SELECT answers,result,completed_at FROM assessment_attempts WHERE id=$1",
            [attempt.id],
          )
        ).rows[0];
        expect(row).toEqual({
          answers: null,
          result: null,
          completed_at: null,
        });
      },
    );
    it("grades answers on the server and persists a non-proctored talent remark", async () => {
      const attempt = await start();
      const answers = await answersFor(attempt, 7);
      const missed = (await key(attempt.id))[7]!.topic;
      const response = await post(
        `/api/assessments/attempts/${attempt.id}/submit`,
        { answers },
      );
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("completed");
      expect(response.body.result).toEqual({
        id: attempt.id,
        assessmentId: "javascript-foundations",
        title: "JavaScript foundations",
        skill: "JavaScript",
        score: 88,
        correct: 7,
        total: 8,
        remark:
          "Strong foundations demonstrated in this self-directed platform skill check; not proctored or expert verification.",
        completedAt: expect.any(String),
        attempt: 1,
        topics: expect.arrayContaining([
          {
            topic: missed,
            correct: expect.any(Number),
            total: expect.any(Number),
          },
        ]),
        focus: [missed],
      });
      expect(
        response.body.result.topics.reduce(
          (n: number, t: { total: number }) => n + t.total,
          0,
        ),
      ).toBe(8);
      const row = (
        await pool.query("SELECT * FROM assessment_attempts WHERE id=$1", [
          attempt.id,
        ])
      ).rows[0];
      expect(row.answers).toEqual(answers);
      expect(row.result).toEqual(response.body.result);
      expect(row.completed_at.toISOString()).toBe(
        response.body.result.completedAt,
      );
      expect(
        (await request(app).get(`/api/assessments/attempts/${attempt.id}`))
          .body,
      ).toEqual(response.body);
      expect(JSON.stringify(response.body)).not.toContain("correctOptionId");
    });
    it("stores a versioned, resumable eight-question attempt owned by the signed-in user", async () => {
      const attempt = await start();
      expect(attempt.status).toBe("in_progress");
      expect(attempt.questions).toHaveLength(8);
      expect(new Set(attempt.questions.map((q) => q.id)).size).toBe(8);
      for (const q of attempt.questions) {
        expect(Object.keys(q).sort()).toEqual(["id", "options", "prompt"]);
        expect(q.options).toHaveLength(4);
        for (const option of q.options)
          expect(Object.keys(option).sort()).toEqual(["id", "label"]);
      }
      expect(attempt.result).toBeUndefined();
      const row = (
        await pool.query("SELECT * FROM assessment_attempts WHERE id=$1", [
          attempt.id,
        ])
      ).rows[0];
      expect(row.user_id).toBe(owner);
      expect(row.question_version).toBe(2);
      expect(row.started_at).toBeInstanceOf(Date);
      expect(row.completed_at).toBeNull();
      expect(row.result).toBeNull();
      expect(
        (await request(app).get(`/api/assessments/attempts/${attempt.id}`))
          .body,
      ).toEqual(attempt);
      expect((await start()).id).toBe(attempt.id);
      expect((await start("web-accessibility")).questions).toHaveLength(8);
    });
    it("draws a new question set with fresh option ids and more questions on missed topics", async () => {
      const first = await start();
      const firstKey = await key(first.id);
      // Miss every question on one topic and answer the rest correctly.
      const weak = firstKey[0]!.topic;
      await post(`/api/assessments/attempts/${first.id}/submit`, {
        answers: Object.fromEntries(
          firstKey.map((q) => [
            q.id,
            q.topic === weak
              ? q.options.find((o) => o.id !== q.correctOptionId)!.id
              : q.correctOptionId,
          ]),
        ),
      });
      await allowRetake();
      const next = await start();
      const nextKey = await key(next.id);
      const previous = new Set(firstKey.map((q) => q.id));
      expect(nextKey.filter((q) => previous.has(q.id))).toEqual([]);
      expect(new Set(nextKey.map((q) => q.topic)).size).toBe(6);
      expect(nextKey.filter((q) => q.topic === weak)).toHaveLength(2);
      const optionIds = new Set(
        firstKey.flatMap((q) => q.options.map((o) => o.id)),
      );
      expect(
        nextKey
          .flatMap((q) => q.options.map((o) => o.id))
          .some((id) => optionIds.has(id)),
      ).toBe(false);
    });
    it("keeps the retake cooldown per check and explains it", async () => {
      const attempt = await start();
      await post(`/api/assessments/attempts/${attempt.id}/submit`, {
        answers: await answersFor(attempt),
      });
      const blocked = await post("/api/assessments/start", {
        assessmentId: "javascript-foundations",
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.message).toMatch(/new question set/);
      expect((await start("web-accessibility")).status).toBe("in_progress");
    });
  },
);
