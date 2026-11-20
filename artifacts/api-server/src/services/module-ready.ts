import { getTableColumns, getTableName, is } from "drizzle-orm";
import type { RequestHandler } from "express";
import { PgTable } from "drizzle-orm/pg-core";
import * as modules from "@workspace/db/modules";
import { databaseQuery, type QueryExecutor } from "./database-query";
import { skillKeyRingConfigured } from "../lib/skill-crypto";

export type ModuleName = keyof typeof modules;

export type FeatureArea =
  | "platform"
  | "authoring"
  | "skills"
  | "recorded"
  | "interview"
  | "voice"
  | "education"
  | "hiring"
  | "social"
  | "video"
  | "moderation";

type Feature = {
  flag: string;
  modules: ModuleName[];
  required: string[];
  guardMigration?: boolean;
  mediaProcessorHeartbeat?: boolean;
};

const features: Record<FeatureArea, Feature> = {
  platform: {
    flag: "PLATFORM_ACCESS_ENABLED",
    modules: ["platform"],
    required: ["SKILL_KEY_RING", "LEDGER_PSEUDONYM_SECRET"],
  },
  authoring: {
    flag: "SKILLS_AUTHORING_ENABLED",
    modules: ["platform", "media", "skillsContent"],
    required: ["SKILL_KEY_RING"],
  },
  skills: {
    flag: "SKILLS_ENABLED",
    modules: [
      "platform",
      "media",
      "skillsContent",
      "distribution",
      "skillsAttempts",
      "skillsGrading",
    ],
    required: ["SKILL_KEY_RING"],
    guardMigration: true,
  },
  recorded: {
    flag: "SKILLS_RECORDED_ENABLED",
    modules: [
      "platform",
      "media",
      "skillsContent",
      "distribution",
      "skillsAttempts",
      "skillsGrading",
    ],
    required: [
      "SKILL_KEY_RING",
      "MEDIA_ORIGIN",
      "EVIDENCE_OBJECT_DIR",
      "EVIDENCE_R2_ACCESS_KEY_ID",
      "EVIDENCE_R2_SECRET_ACCESS_KEY",
      "MEDIA_PROCESSOR_ENABLED",
      "CONSENT_RECORDING_VERSION",
      "CONSENT_AI_EVALUATION_VERSION",
      "CONSENT_INTEGRITY_MONITORING_VERSION",
    ],
    mediaProcessorHeartbeat: true,
    guardMigration: true,
  },
  interview: {
    flag: "SKILLS_INTERVIEW_ENABLED",
    modules: [
      "platform",
      "media",
      "skillsContent",
      "distribution",
      "skillsAttempts",
      "skillsGrading",
    ],
    required: [
      "SKILL_KEY_RING",
      "CONSENT_RECORDING_VERSION",
      "CONSENT_AI_EVALUATION_VERSION",
      "CONSENT_INTEGRITY_MONITORING_VERSION",
    ],
    guardMigration: true,
  },
  voice: {
    flag: "SKILLS_VOICE_ENABLED",
    modules: [
      "platform",
      "media",
      "skillsContent",
      "distribution",
      "skillsAttempts",
      "skillsGrading",
    ],
    required: [
      "SKILL_KEY_RING",
      "AI_MODEL_SPEECH",
      "MEDIA_ORIGIN",
      "EVIDENCE_OBJECT_DIR",
      "EVIDENCE_R2_ACCESS_KEY_ID",
      "EVIDENCE_R2_SECRET_ACCESS_KEY",
      "MEDIA_PROCESSOR_ENABLED",
      "CONSENT_RECORDING_VERSION",
      "CONSENT_AI_EVALUATION_VERSION",
      "CONSENT_INTEGRITY_MONITORING_VERSION",
    ],
    mediaProcessorHeartbeat: true,
    guardMigration: true,
  },
  education: {
    flag: "EDUCATION_ENABLED",
    modules: ["platform", "distribution"],
    required: [],
  },
  hiring: {
    flag: "HIRING_CHECKS_ENABLED",
    modules: ["platform", "distribution"],
    required: [],
  },
  social: {
    flag: "SOCIAL_MEDIA_ENABLED",
    modules: ["media", "social"],
    required: [],
  },
  video: {
    flag: "SOCIAL_VIDEO_ENABLED",
    modules: ["media", "social"],
    required: ["VIDEO_PROVIDER_ACCOUNT_ID", "VIDEO_PROVIDER_API_TOKEN"],
  },
  moderation: {
    flag: "MODERATION_ENABLED",
    modules: ["social", "platform"],
    required: [],
  },
};

const moduleTables = Object.fromEntries(
  Object.entries(modules).map(([name, namespace]) => [
    name,
    Object.values(namespace).filter((value) => is(value, PgTable)),
  ]),
) as Record<ModuleName, PgTable[]>;

type Readiness = { ready: boolean; until: number };
const cache = new Map<ModuleName, Readiness>();
const inFlight = new Map<ModuleName, Promise<boolean>>();
const readyTtl = 5 * 60 * 1000;
const absentTtl = 5 * 1000;

function expectedColumns(name: ModuleName): string[][] {
  return moduleTables[name].flatMap((table) =>
    Object.values(getTableColumns(table)).map((column) => [
      getTableName(table),
      column.name,
    ]),
  );
}

async function checkModule(
  name: ModuleName,
  query: QueryExecutor,
): Promise<boolean> {
  const columns = expectedColumns(name);
  if (!columns.length) return false;
  const result = await query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM unnest($1::text[],$2::text[]) AS expected(table_name,column_name)
       LEFT JOIN information_schema.columns actual ON actual.table_schema='public'
         AND actual.table_name=expected.table_name AND actual.column_name=expected.column_name
       WHERE actual.column_name IS NULL
     ) AS healthy`,
    [columns.map(([table]) => table), columns.map(([, column]) => column)],
  );
  return result.rows[0]?.healthy === true;
}

export async function refreshModule(
  name: ModuleName,
  query: QueryExecutor = databaseQuery,
  force = false,
): Promise<boolean> {
  if (force) {
    const ready = await checkModule(name, query).catch(() => false);
    cache.set(name, {
      ready,
      until: Date.now() + (ready ? readyTtl : absentTtl),
    });
    return ready;
  }
  const current = cache.get(name);
  if (current && Date.now() < current.until) return current.ready;
  const pending = inFlight.get(name);
  if (pending) return pending;
  const promise = checkModule(name, query)
    .catch(() => false)
    .then((ready) => {
      cache.set(name, {
        ready,
        until: Date.now() + (ready ? readyTtl : absentTtl),
      });
      return ready;
    })
    .finally(() => inFlight.delete(name));
  inFlight.set(name, promise);
  return promise;
}

/** True only while a recent schema probe proved this module complete. */
export function moduleReadySync(name: ModuleName): boolean {
  const result = cache.get(name);
  return Boolean(result?.ready && Date.now() < result.until);
}

/** Refresh stale module probes without taking down the core API on failure. */
export const modulesWarm: RequestHandler = async (_req, _res, next) => {
  await Promise.all(
    (Object.keys(moduleTables) as ModuleName[]).map((name) =>
      refreshModule(name),
    ),
  );
  next();
};

const guardTables = [
  "skill_ledger",
  "skill_ledger_checkpoints",
  "skill_question_versions",
  "skill_rubric_versions",
  "skill_question_keys",
  "skill_question_media",
  "skill_test_versions",
  "skill_sections",
  "skill_section_slots",
  "skill_slot_items",
  "skill_anchors",
  "skill_content_access",
  "skill_item_rulings",
  "skill_attempt_draws",
  "skill_attempt_item_keys",
  "skill_attempt_items",
  "skill_responses",
  "skill_integrity_events",
  "skill_interview_turns",
  "skill_grades",
  "skill_item_scores",
  "skill_results",
  "skill_credentials",
] as const;

export async function guardsReady(
  query: QueryExecutor = databaseQuery,
): Promise<boolean> {
  try {
    const result = await query(
      `WITH expected(trigger_name, table_oid) AS (
         SELECT item.trigger_name, to_regclass('public.' || item.table_name)
         FROM unnest($1::text[], $2::text[]) AS item(trigger_name, table_name)
       )
       SELECT count(*) = cardinality($1::text[]) AS ready
       FROM expected e
       WHERE e.table_oid IS NOT NULL AND EXISTS (
         SELECT 1 FROM pg_trigger t
         WHERE NOT t.tgisinternal AND t.tgname=e.trigger_name
           AND t.tgrelid=e.table_oid AND t.tgenabled IN ('O','A')
       )`,
      [
        guardTables.map((table) => `skill_guard_${table}`),
        guardTables.map((table) => table),
      ],
    );
    return result.rows[0]?.ready === true;
  } catch {
    return false;
  }
}

export function featureConfigurationReady(area: FeatureArea): boolean {
  const feature = features[area];
  const configuredValues = feature.required.every((key) => {
    const value = process.env[key]?.trim();
    if (!value) return false;
    if (key === "SKILL_KEY_RING") return skillKeyRingConfigured();
    if (
      [
        "LEDGER_PSEUDONYM_SECRET",
        "MEDIA_TICKET_SECRET",
        "LEDGER_SIGNING_KEY",
      ].includes(key)
    )
      return Buffer.byteLength(value) >= 32;
    return true;
  });
  return process.env[feature.flag] === "true" && configuredValues;
}

/** Synchronous config and cached schema gates shared by route middleware. */
export async function featureReady(area: FeatureArea): Promise<boolean> {
  const feature = features[area];
  const configured =
    featureConfigurationReady(area) && feature.modules.every(moduleReadySync);
  if (!configured) return false;
  if (feature.guardMigration && !(await guardsReady())) return false;
  if (feature.mediaProcessorHeartbeat && !(await mediaProcessorReady()))
    return false;
  return true;
}

/** Worker heartbeat is live only while the processor refreshed it recently. */
export async function mediaProcessorReady(
  query: QueryExecutor = databaseQuery,
): Promise<boolean> {
  try {
    const result = await query(
      `SELECT EXISTS (
         SELECT 1 FROM service_heartbeats
         WHERE service='media-processor'
           AND last_seen_at > now() - interval '180 seconds'
       ) AS ready`,
      [],
    );
    return result.rows[0]?.ready === true;
  } catch {
    return false;
  }
}

/** Core-safe live schema check used before account cascades can erase media owners. */
export async function mediaCleanupSchemaReady(
  query: QueryExecutor = databaseQuery,
): Promise<"absent" | "ready" | "unavailable"> {
  try {
    const result = await query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='media_objects'
       ) AS present`,
      [],
    );
    if (result.rows[0]?.present !== true) return "absent";
    return (await refreshModule("media", query, true))
      ? "ready"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function resetModuleReadiness(): void {
  cache.clear();
  inFlight.clear();
}

export function moduleDependencies(area: FeatureArea): readonly ModuleName[] {
  return features[area].modules;
}
