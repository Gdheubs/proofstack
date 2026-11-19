// Second schema barrel. The API's readiness check (services/health.ts) reads
// only ../schema, so a table added here never takes the existing site down
// while its migration waits for approval; each area checks its own module.
// Tables are reached through their namespace, for example platform.workJobsTable.
export * as platform from "./platform";
export * as media from "./media";
export * as social from "./social";
export * as skillsContent from "./skills-content";
export * as distribution from "./distribution";
export * as skillsAttempts from "./skills-attempts";
export * as skillsGrading from "./skills-grading";
