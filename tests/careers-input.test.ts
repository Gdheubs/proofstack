import { describe, it, expect } from "vitest";
import { careerInput } from "../artifacts/api-server/src/services/careers-input";
const id = "550e8400-e29b-41d4-a716-446655440000";
describe("Career input boundaries", () => {
  it("rejects forged applicant identities and unrecognized fields", () => {
    expect(() =>
      careerInput({
        action: "apply",
        jobId: id,
        note: "A meaningful application explaining my contribution",
        projectIds: [id],
        applicantId: id,
      }),
    ).toThrow();
  });
  it("rejects duplicate or excessive evidence and empty applications", () => {
    for (const projectIds of [[], [id, id], [id, id, id, id]])
      expect(() =>
        careerInput({
          action: "apply",
          jobId: id,
          note: "A meaningful application explaining my contribution",
          projectIds,
        }),
      ).toThrow();
  });
  it("rejects script URLs and arbitrary workflow statuses", () => {
    expect(() =>
      careerInput({
        action: "issue-save",
        projectId: id,
        title: "Task",
        description: "",
        status: "done",
        assigneeId: null,
        evidenceUrl: "javascript:alert(1)",
      }),
    ).toThrow();
    expect(() =>
      careerInput({
        action: "application-status",
        id,
        status: "hired-without-review",
      }),
    ).toThrow();
  });
  it("accepts explicit private-by-default discovery preferences", () => {
    expect(
      careerInput({
        action: "career-save",
        headline: "Builder",
        roles: [],
        availability: "closed",
        discoverable: false,
        featuredProjects: [],
      }),
    ).toMatchObject({ discoverable: false });
  });
});
