import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityDb } from "../artifacts/api-server/src/services/community-policy";
import type { AuthSession } from "../artifacts/api-server/src/services/auth-sessions";
import { socialAction } from "../artifacts/api-server/src/services/community-social-actions";
import { assistCommunity } from "../artifacts/api-server/src/services/community-ai";

const uid = "cc1575d2-514f-42fb-97b4-f6b6b7503a75";
const id = "cc1575d2-514f-42fb-97b4-f6b6b7503a76";
const session = { user: { id: uid } } as AuthSession;
const actor = { handle: "builder", display_name: "Builder" };
afterEach(() => vi.unstubAllEnvs());
describe("Community regression protection", () => {
  it("keeps AI optional and returns a controlled error without provider configuration", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "");
    await expect(
      assistCommunity({
        task: "profile-summary",
        text: "I build accessible web applications for small businesses.",
      }),
    ).rejects.toMatchObject({ status: 503, code: "AI_CONFIGURATION_REQUIRED" });
  });
  it("allows an author to delete a post after its linked project becomes private", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({
      rows: [{ id, author_id: uid, project_id: id }],
    });
    const result = await socialAction(
      { query } as unknown as CommunityDb,
      session,
      { action: "post-delete", id },
      actor,
    );
    expect(result).toEqual({ message: "Post deleted" });
    expect(query.mock.calls[0][1]).toEqual([id, uid]);
    expect(query.mock.calls.at(-1)?.[0]).toBe(
      "DELETE FROM community_posts WHERE id=$1",
    );
  });
  it("denies deleting somebody else's hidden post before making any writes", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      socialAction(
        { query } as unknown as CommunityDb,
        session,
        { action: "post-delete", id },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
