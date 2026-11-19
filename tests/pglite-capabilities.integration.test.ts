import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

// Proves the mechanism migration 0028_skill_guards depends on, in whichever
// engine runs this file (PGlite in the embedded harness, PostgreSQL in CI):
// a row trigger with WHEN (pg_trigger_depth() = 0) refuses a statement issued
// directly and lets a foreign-key cascade or SET NULL pass, because those run
// inside PostgreSQL's own referential trigger at depth 1.
// Everything lives in a throwaway schema; no product table is touched.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "guard triggers at trigger depth 0",
  () => {
    const schema = `guard_${randomUUID().replaceAll("-", "")}`;
    const run = (text: string, values: unknown[] = []) =>
      pool.query(text.replace(/\bs\./g, `"${schema}".`), values);
    const refused = { code: "P0001", message: "guarded row" };

    beforeAll(async () => {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await run("CREATE TABLE s.owners(id uuid PRIMARY KEY)");
      await run("CREATE TABLE s.actors(id uuid PRIMARY KEY)");
      for (const table of ["guarded", "unconditional"])
        await run(
          `CREATE TABLE s.${table}(
            id uuid PRIMARY KEY,
            owner_id uuid NOT NULL REFERENCES s.owners(id) ON DELETE CASCADE,
            actor_id uuid REFERENCES s.actors(id) ON DELETE SET NULL,
            body text NOT NULL,
            note text
          )`,
        );
      // Allows a short list of column changes (note) and raises otherwise.
      await run(
        `CREATE FUNCTION s.guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'UPDATE' AND NEW.id = OLD.id AND NEW.owner_id = OLD.owner_id
            AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id AND NEW.body = OLD.body THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'guarded row';
        END $$`,
      );
      await run(
        `CREATE TRIGGER guarded_guard BEFORE UPDATE OR DELETE ON s.guarded
         FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION s.guard()`,
      );
      // The ledger form: no WHEN clause, and TRUNCATE is refused as well.
      await run(
        `CREATE TRIGGER unconditional_guard BEFORE UPDATE OR DELETE ON s.unconditional
         FOR EACH ROW EXECUTE FUNCTION s.guard()`,
      );
      await run(
        `CREATE TRIGGER unconditional_truncate BEFORE TRUNCATE ON s.unconditional
         FOR EACH STATEMENT EXECUTE FUNCTION s.guard()`,
      );
    });
    afterAll(async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    });

    async function seed(table: "guarded" | "unconditional") {
      const row = {
        id: randomUUID(),
        owner: randomUUID(),
        actor: randomUUID(),
      };
      await run("INSERT INTO s.owners(id) VALUES($1)", [row.owner]);
      await run("INSERT INTO s.actors(id) VALUES($1)", [row.actor]);
      await run(
        `INSERT INTO s.${table}(id,owner_id,actor_id,body) VALUES($1,$2,$3,'frozen')`,
        [row.id, row.owner, row.actor],
      );
      return row;
    }
    const read = async (table: string, id: string) =>
      (await run(`SELECT actor_id,body,note FROM s.${table} WHERE id=$1`, [id]))
        .rows;

    it("refuses a direct UPDATE and a direct DELETE", async () => {
      const row = await seed("guarded");
      await expect(
        run("UPDATE s.guarded SET body='rewritten' WHERE id=$1", [row.id]),
      ).rejects.toMatchObject(refused);
      await expect(
        run("UPDATE s.guarded SET actor_id=NULL WHERE id=$1", [row.id]),
      ).rejects.toMatchObject(refused);
      await expect(
        run("DELETE FROM s.guarded WHERE id=$1", [row.id]),
      ).rejects.toMatchObject(refused);
      expect(await read("guarded", row.id)).toEqual([
        { actor_id: row.actor, body: "frozen", note: null },
      ]);
    });

    it("lets the function allow a listed column change", async () => {
      const row = await seed("guarded");
      await run("UPDATE s.guarded SET note='reviewed' WHERE id=$1", [row.id]);
      expect(await read("guarded", row.id)).toEqual([
        { actor_id: row.actor, body: "frozen", note: "reviewed" },
      ]);
    });

    it("lets a foreign-key SET NULL through", async () => {
      const row = await seed("guarded");
      await run("DELETE FROM s.actors WHERE id=$1", [row.actor]);
      expect(await read("guarded", row.id)).toEqual([
        { actor_id: null, body: "frozen", note: null },
      ]);
    });

    it("lets a foreign-key cascade through", async () => {
      const row = await seed("guarded");
      await run("DELETE FROM s.owners WHERE id=$1", [row.owner]);
      expect(await read("guarded", row.id)).toEqual([]);
    });

    // The control: without the WHEN clause the same function stops the
    // referential actions too, so the clause is what lets erasure through.
    it("refuses cascades, SET NULL and TRUNCATE when the guard has no WHEN clause", async () => {
      const row = await seed("unconditional");
      await expect(
        run("DELETE FROM s.actors WHERE id=$1", [row.actor]),
      ).rejects.toMatchObject(refused);
      await expect(
        run("DELETE FROM s.owners WHERE id=$1", [row.owner]),
      ).rejects.toMatchObject(refused);
      await expect(run("TRUNCATE s.unconditional")).rejects.toMatchObject(
        refused,
      );
      expect(await read("unconditional", row.id)).toEqual([
        { actor_id: row.actor, body: "frozen", note: null },
      ]);
    });

    it("evaluates the depth as 0 for a direct statement and 1 inside a referential action", async () => {
      await run(
        "CREATE TABLE s.depths(id uuid PRIMARY KEY, owner_id uuid REFERENCES s.owners(id) ON DELETE CASCADE)",
      );
      await run(
        "CREATE TABLE s.seen(op text NOT NULL, depth integer NOT NULL)",
      );
      await run(
        `CREATE FUNCTION s.record_depth() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO s.seen(op,depth) VALUES(TG_ARGV[0], pg_trigger_depth());
          RETURN OLD;
        END $$`,
      );
      await run(
        `CREATE TRIGGER depths_direct BEFORE DELETE ON s.depths
         FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION s.record_depth('direct')`,
      );
      await run(
        `CREATE TRIGGER depths_nested BEFORE DELETE ON s.depths
         FOR EACH ROW WHEN (pg_trigger_depth() > 0) EXECUTE FUNCTION s.record_depth('nested')`,
      );
      const owner = randomUUID();
      await run("INSERT INTO s.owners(id) VALUES($1)", [owner]);
      await run("INSERT INTO s.depths(id,owner_id) VALUES($1,NULL),($2,$3)", [
        randomUUID(),
        randomUUID(),
        owner,
      ]);
      await run("DELETE FROM s.depths WHERE owner_id IS NULL");
      await run("DELETE FROM s.owners WHERE id=$1", [owner]);
      // Inside a function body the depth already counts that trigger, which
      // is why the guard tests it in the WHEN clause and never in the body.
      expect(
        (await run("SELECT op,depth FROM s.seen ORDER BY depth")).rows,
      ).toEqual([
        { op: "direct", depth: 1 },
        { op: "nested", depth: 2 },
      ]);
    });
  },
);
