import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { getCommunity } from "../artifacts/api-server/src/services/community-query";
import { getRepositories } from "../artifacts/api-server/src/services/repositories";

// Execute the production readers against tracked migrations and real SQL fixtures.
// The embedded config runs these in a disposable PostgreSQL engine, not a query mock.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "navigation content SQL boundaries",
  () => {
    const owner = randomUUID();
    const skill = `nav${owner.replaceAll("-", "")}`;
    const outsider = randomUUID();
    const eligible = randomUUID(),
      other = randomUUID(),
      existing = randomUUID(),
      unauthorized = randomUUID();
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$1::text||'@example.test')",
        [owner],
      );
      await pool.query(
        "INSERT INTO profiles(user_id,display_name,handle,skills) VALUES($1,'Navigation builder',$2,$3::jsonb)",
        [owner, skill, JSON.stringify([skill])],
      );
      await pool.query(
        "INSERT INTO users(id,auth_subject,email) VALUES($1::uuid,$1::text,$1::text||'@example.test')",
        [outsider],
      );
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,slug,title,description) SELECT id,$2,id::text,'Navigation fixture','Scope test' FROM unnest($1::uuid[]) ids(id)",
        [[eligible, other, existing], owner],
      );
      await pool.query(
        "INSERT INTO community_projects(id,owner_id,slug,title,description) VALUES($1::uuid,$2,$1::text,'Other owner','Scope test')",
        [unauthorized, outsider],
      );
      await pool.query("INSERT INTO repositories(project_id) VALUES($1)", [
        existing,
      ]);
    });
    afterAll(async () => {
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner, outsider],
      ]);
      await pool.end();
    });

    it.each(["developers", "skills", "all"])(
      "returns only the selected %s search sections (N3)",
      async (type) => {
        const data = await getCommunity(
          { view: "search", q: skill, type },
          null,
        );
        expect(data.people.map((person) => person.id)).toEqual(
          type === "skills" ? [] : [owner],
        );
        expect(data.skills).toEqual(type === "developers" ? [] : [skill]);
        expect(data.projects).toEqual([]);
        expect(data.organizations).toEqual([]);
        expect(data.posts).toEqual([]);
      },
    );

    it("offers only the exact eligible project on a project-filtered directory (N8)", async () => {
      const data = await getRepositories({ projectId: eligible }, owner);
      expect(data.projects.map((project) => project.id)).toEqual([eligible]);
      expect(data.repositories).toEqual([]);
    });
    it("never falls back to another initializer when the selected project already has a repository (N8)", async () => {
      const data = await getRepositories({ projectId: existing }, owner);
      expect(data.projects).toEqual([]);
      expect(data.repositories.map((repo) => repo.projectId)).toEqual([
        existing,
      ]);
    });
    it("offers no initializer for a selected project the viewer cannot manage (N8)", async () => {
      const data = await getRepositories({ projectId: unauthorized }, owner);
      expect(data.projects).toEqual([]);
    });
    it("keeps the eligible multi-project chooser on the unfiltered directory (N8)", async () => {
      const data = await getRepositories({}, owner);
      expect(data.projects.map((project) => project.id).sort()).toEqual(
        [eligible, other].sort(),
      );
    });
    it("does not offer initialization to guests (N8)", async () => {
      expect(
        (await getRepositories({ projectId: eligible }, null)).projects,
      ).toEqual([]);
    });
  },
);
