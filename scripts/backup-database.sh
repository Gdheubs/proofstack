#!/usr/bin/env bash
# Logical PostgreSQL backup: dump -> verify -> encrypt -> upload to private R2.
#
# Required: BACKUP_DATABASE_URL, BACKUP_PASSPHRASE.
# Upload (scheduled backups): BACKUP_BUCKET, R2_ENDPOINT, AWS_ACCESS_KEY_ID,
#   AWS_SECRET_ACCESS_KEY. Without BACKUP_BUCKET the encrypted file is kept in
#   BACKUP_OUTPUT_DIR instead (CI restore drill).
# Optional: BACKUP_MIN_TABLES (default 40), the fewest tables a valid dump has.
# Never prints connection strings, passphrases or data.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
if [ "${#BACKUP_PASSPHRASE}" -lt 32 ]; then
  echo "BACKUP_PASSPHRASE must be at least 32 characters" >&2
  exit 1
fi
min_tables="${BACKUP_MIN_TABLES:-40}"

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$work/proofstack-$stamp.dump"

# Application data, Supabase identities (auth) and the migration ledger.
# Patterns that match nothing (no auth schema outside Supabase) are skipped.
pg_dump "$BACKUP_DATABASE_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=auth --schema=drizzle \
  --file="$dump"

# A readable archive with the expected tables, or no backup at all.
pg_restore --list "$dump" >"$work/toc.txt"
tables="$(grep -c ' TABLE DATA ' "$work/toc.txt" || true)"
if [ "$tables" -lt "$min_tables" ] ||
  ! grep -Eq ' TABLE DATA public users( |$)' "$work/toc.txt" ||
  ! grep -Eq ' TABLE DATA drizzle __drizzle_migrations( |$)' "$work/toc.txt"; then
  echo "Backup verification failed: $tables table(s); required tables missing" >&2
  exit 1
fi

gpg --batch --yes --quiet --pinentry-mode loopback \
  --symmetric --cipher-algo AES256 \
  --passphrase-fd 3 --output "$dump.gpg" "$dump" \
  3< <(printf '%s' "$BACKUP_PASSPHRASE")
size="$(stat -c%s "$dump.gpg")"

if [ -n "${BACKUP_BUCKET:-}" ]; then
  : "${R2_ENDPOINT:?R2_ENDPOINT is required for upload}"
  key="database/proofstack-$stamp.dump.gpg"
  aws s3 cp "$dump.gpg" "s3://$BACKUP_BUCKET/$key" \
    --endpoint-url "$R2_ENDPOINT" --only-show-errors
  echo "Backup uploaded: $key ($size bytes, $tables tables)"
else
  : "${BACKUP_OUTPUT_DIR:?Set BACKUP_BUCKET to upload or BACKUP_OUTPUT_DIR to keep the file}"
  mkdir -p "$BACKUP_OUTPUT_DIR"
  cp "$dump.gpg" "$BACKUP_OUTPUT_DIR/"
  echo "Backup written: $BACKUP_OUTPUT_DIR/$(basename "$dump.gpg") ($size bytes, $tables tables)"
fi
