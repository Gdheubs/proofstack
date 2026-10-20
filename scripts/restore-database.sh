#!/usr/bin/env bash
# Restores an encrypted backup from backup-database.sh into an EMPTY database.
#
# Usage: RESTORE_DATABASE_URL=... BACKUP_PASSPHRASE=... \
#        scripts/restore-database.sh proofstack-<stamp>.dump.gpg
# Refuses to touch a database that already has tables. Restoring Supabase's
# auth schema into a different Supabase project needs that project's own
# procedure; this script targets an isolated PostgreSQL for drills/inspection.
set -euo pipefail

file="${1:?Usage: restore-database.sh <backup.dump.gpg>}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

existing="$(psql "$RESTORE_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
if [ "$existing" != "0" ]; then
  echo "Refusing to restore: the target database already has $existing table(s)" >&2
  exit 1
fi

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gpg --batch --yes --quiet --pinentry-mode loopback --decrypt \
  --passphrase-fd 3 --output "$work/restore.dump" "$file" \
  3< <(printf '%s' "$BACKUP_PASSPHRASE")

# Recreate the dumped schemas (public included) exactly as archived.
psql "$RESTORE_DATABASE_URL" -qc "DROP SCHEMA IF EXISTS public CASCADE"
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-privileges \
  --exit-on-error --single-transaction "$work/restore.dump"

tables="$(psql "$RESTORE_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth','drizzle')")"
migrations="$(psql "$RESTORE_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations")"
echo "Restored $tables table(s); $migrations applied migration(s) recorded"
