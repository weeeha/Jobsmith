#!/usr/bin/env bash
# Restore a backup: restore.sh <db dump> <storage tarball>
# Run it against the stack you want to overwrite. The app is stopped while the
# database and the storage volume are replaced, then started again.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: restore.sh <db-....dump> <storage-....tar.gz>" >&2
  exit 64
fi

abs() { (cd "$(dirname "$1")" && printf '%s/%s\n' "$PWD" "$(basename "$1")"); }

for f in "$1" "$2"; do
  if [ ! -f "$f" ]; then
    echo "not a file: $f" >&2
    exit 64
  fi
done
dump="$(abs "$1")"
tar_abs="$(abs "$2")"

cd "$(dirname "$0")"

# Refuse a damaged dump before anything is stopped.
if ! docker compose exec -T postgres pg_restore --list < "$dump" > /dev/null; then
  echo "refusing to restore: pg_restore cannot read $dump" >&2
  exit 1
fi

docker compose stop app

docker compose exec -T postgres pg_restore -U jobsmith -d jobsmith \
  --clean --if-exists --no-owner < "$dump"

docker compose run --rm --no-deps --entrypoint sh \
  -v "$tar_abs:/restore/storage.tgz:ro" app \
  -c 'find /data -mindepth 1 -delete && tar xzf /restore/storage.tgz -C /data'

docker compose up -d --wait app
echo "restored $dump and $tar_abs"
