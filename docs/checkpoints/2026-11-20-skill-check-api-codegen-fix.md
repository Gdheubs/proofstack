# Skill Check API codegen barrel fix (2026-11-20)

Parent: `e346e76` (API contracts; hosted CI reached codegen and found a
regenerated Zod export collision).
Status: **complete** for the codegen export follow-up. The first attempt passed
codegen and generated-output checks, then typecheck exposed missing direct
exports for existing API types; the normalizer now restores those exports.

## Scope

Made the Zod package barrel normalization part of the API-spec codegen command.
Orval generates a wildcard export for both schema values and TypeScript types,
which collides for request bodies sharing a name. The deterministic post-codegen
script restores the collision-safe `ApiTypes` namespace after every generation
and explicitly re-exports all non-colliding generated types so existing
`@workspace/api-zod` imports keep working. Conflicting request body types stay
available through `ApiTypes`.

## Validation actually run

- Orval regeneration: passed for React and Zod outputs.
- `scripts/normalize-api-zod-barrel.mjs`: ran as the codegen follow-up step.
- TypeScript project build (`node_modules/.bin/tsc.cmd --build`): passed.
- Focused API boundary tests (`vitest run tests/api.test.ts`): 12 passed.
- ESLint on the test and normalization script: passed.
- Prettier on the changed config, barrel, script and checkpoint: passed after
  formatting the package script entry.
- Hosted `ProofStack CI` run `44600375934` on
  `e0763cbfbdfbd9723608c01e1ef7de5a27846c1f`: passed, including migrations,
  generated-output check, audit, lint, format, typecheck, coverage, integration
  tests, PostgreSQL 17 backup/restore, API build/health, and Worker size gate.
- Hosted `ProofStack Security` run `44600376052` on the same SHA: passed.

## Next step

Proceed to DB-2 in `docs/skill-check-platform.md`: implement the additive
0023_media_social schema and its constraint, export-policy, and migration
acceptance tests. The migration is not applied to a production database.
