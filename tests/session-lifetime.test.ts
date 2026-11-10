import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ close: async () => {} }));
// Real SQL on WASM PostgreSQL with the tracked migrations.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const database = await PGlite.create();
  const folder = new URL("../lib/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", folder), "utf8"),
  );
  for (const entry of journal.entries)
    await database.exec(
      await readFile(new URL(`${entry.tag}.sql`, folder), "utf8"),
    );
  store.close = () => database.close();
  const query = (text: string, values: unknown[] = []) =>
    database.query(text, values);
  return { pool: { query, connect: async () => ({ query, release() {} }) } };
});

import { pool } from "@workspace/db";
import {
  EXTEND_SESSION_SQL,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  sessionEnded,
} from "../artifacts/api-server/src/services/auth-sessions";

afterAll(async () => store.close());
const DAY = 86400000;
const now = Date.parse("2026-11-10T12:00:00Z");
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  revoked_at: null,
  encrypted_credentials: "sealed",
  expires_at: new Date(now + DAY),
  last_seen_at: new Date(now - DAY),
  created_at: new Date(now - 2 * DAY),
  ...over,
});

describe("session lifetime", () => {
  it("keeps sessions through up to 7 days without activity", () => {
    expect(SESSION_IDLE_MS).toBe(7 * DAY);
    expect(sessionEnded(row(), now)).toBe(false);
    expect(
      sessionEnded(row({ last_seen_at: new Date(now - 6.9 * DAY) }), now),
    ).toBe(false);
    expect(
      sessionEnded(row({ last_seen_at: new Date(now - 7.1 * DAY) }), now),
    ).toBe(true);
  });
  it("ends sessions 30 days after sign-in, and when revoked or expired", () => {
    expect(SESSION_MAX_MS).toBe(30 * DAY);
    expect(
      sessionEnded(row({ created_at: new Date(now - 31 * DAY) }), now),
    ).toBe(true);
    expect(sessionEnded(row({ revoked_at: new Date(now) }), now)).toBe(true);
    expect(sessionEnded(row({ encrypted_credentials: null }), now)).toBe(true);
    expect(sessionEnded(row({ expires_at: new Date(now - 1) }), now)).toBe(
      true,
    );
  });

  it("extends on activity to 7 days, capped at 30 days after sign-in", async () => {
    const user = randomUUID();
    await pool.query(
      "INSERT INTO users(id,auth_subject,email) VALUES($1,$2,$3)",
      [user, user, `${user}@example.test`],
    );
    const insert = async (createdDaysAgo: number, recovery = false) => {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO sessions(id,user_id,provider_session_id,handle_hash,encrypted_credentials,device_hash,device_label,created_at,last_seen_at,expires_at,password_recovery)
         VALUES($1,$2,$3,$4,'sealed','device','Unit',now()-$5*interval '1 day',now(),now()+interval '10 minutes',$6)`,
        [id, user, randomUUID(), randomUUID(), createdDaysAgo, recovery],
      );
      return id;
    };
    const extend = async (id: string) =>
      new Date(
        (
          await pool.query(EXTEND_SESSION_SQL, [
            id,
            SESSION_MAX_MS,
            SESSION_IDLE_MS,
          ])
        ).rows[0].expires_at as string,
      ).getTime();
    const daysFromNow = (t: number) => (t - Date.now()) / DAY;
    expect(daysFromNow(await extend(await insert(2)))).toBeCloseTo(7, 1);
    // Signed in 29 days ago: only one more day remains.
    expect(daysFromNow(await extend(await insert(29)))).toBeCloseTo(1, 1);
    // A password-recovery session keeps its ten minutes.
    expect(daysFromNow(await extend(await insert(0, true)))).toBeLessThan(0.01);
  });
});
