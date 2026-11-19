# Skill Check API codegen barrel fix (2026-11-20)

Parent: `e346e76` (API contracts; hosted CI reached codegen and found a
regenerated Zod export collision).
Status: **follow-up in progress** pending hosted CI.

## Scope

Made the Zod package barrel normalization part of the API-spec codegen command.
Orval generates a wildcard export for both schema values and TypeScript types,
which collides for request bodies sharing a name. The deterministic post-codegen
script restores the collision-safe `ApiTypes` namespace after every generation.

## Validation actually run

- Orval regeneration: passed for React and Zod outputs.
- `scripts/normalize-api-zod-barrel.mjs`: ran as the codegen follow-up step.
- TypeScript project build (`node_modules/.bin/tsc.cmd --build`): passed.
- Focused API boundary tests (`vitest run tests/api.test.ts`): 12 passed.
- ESLint on the test and normalization script: passed.
- Prettier on the changed config, barrel, script and checkpoint: passed after
  formatting the package script entry.

## Next step

Run the full relevant local checks, commit and push this correction, then
inspect CI for the exact pushed SHA. Do not treat the failed parent CI run as a
pass.
