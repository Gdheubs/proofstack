import { beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query } }));
import app from "../artifacts/api-server/src/app";
beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [{ hits: 1, window_start: new Date() }] });
});
it("serves the curated skill-check catalog without questions or answer keys", async () => {
  const response = await request(app).get("/api/assessments");
  expect(response.status).toBe(200);
  // The catalog is identical for everyone, so browsers and the edge may cache it.
  expect(response.headers["cache-control"]).toBe(
    "public, max-age=300, s-maxage=300",
  );
  expect(response.body.assessments).toEqual([
    {
      id: "javascript-foundations",
      title: "JavaScript foundations",
      skill: "JavaScript",
      description: expect.any(String),
      questionCount: 8,
      durationMinutes: 12,
      retakeCooldownHours: 24,
    },
    {
      id: "web-accessibility",
      title: "Web accessibility",
      skill: "Web accessibility",
      description: expect.any(String),
      questionCount: 8,
      durationMinutes: 12,
      retakeCooldownHours: 24,
    },
  ]);
  expect(JSON.stringify(response.body)).not.toMatch(/correct|answer|questions/);
});
