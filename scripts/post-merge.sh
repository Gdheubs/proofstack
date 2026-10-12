#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate:dev
pnpm --filter @workspace/api-spec run codegen
