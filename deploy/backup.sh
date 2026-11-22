#!/usr/bin/env bash
# Back up the database and the storage volume. Run from anywhere; the script
# works inside the folder that holds compose.yaml and writes to ./backups.
# KEEP_DAYS (default 14) is how long older backups are kept.
set -euo pipefail
umask 077

cd "$(dirname "$0")"

keep_days="${KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_name="db-${stamp}.dump"
tar_name="storage-${stamp}.tar.gz"
mkdir -p backups
dump="backups/${dump_name}"
tarball="backups/${tar_name}"

# Remove this run's partial files on any failure; older backups are never touched.
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    rm -f "$dump" "$tarball"
    echo "backup failed (exit $status); this run's files were removed" >&2
  fi
}
trap cleanup EXIT

# The database first, then the files, so a stored file never lacks its row.
docker compose exec -T postgres pg_dump -U jobsmith -Fc jobsmith > "$dump"

docker compose run --rm --no-deps --entrypoint tar \
  -v "$PWD/backups:/backup" app czf "/backup/${tar_name}" -C /data .

# The tarball is written by the container user; tighten it when we own it.
chmod 600 "$dump" "$tarball" || echo "warning: could not set mode 600 on the backup files" >&2

# Only now, with both files in place, drop what is older than KEEP_DAYS.
find backups -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) \
  -mtime "+${keep_days}" -delete

echo "wrote ${dump} and ${tarball}"
