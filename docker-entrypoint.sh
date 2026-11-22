#!/bin/sh
# Entrypoint of the Jobsmith image. POSIX sh: the runtime image's sh is dash.
set -eu

usage() {
  cat >&2 <<'USAGE'
Usage: docker-entrypoint.sh [command] [arguments]

Commands:
  serve                 check the schema, migrate, start the app (default)
  migrate               apply database migrations
  seed [--pack <id>]    load demo data
  scheduler             run the scheduler
  tick                  run the scheduler once
  feed-scan             scan the job feed
  packs-check <file>    validate a pack file
  import-applications <file> [--email] [--dry-run]
                        import applications from a file
USAGE
}

# Runs commands/<name>.mjs with the remaining arguments, or says it is not
# part of this build.
run_bundle() {
  name=$1
  shift
  if [ ! -f "commands/$name.mjs" ]; then
    echo "$name is not available in this build" >&2
    exit 64
  fi
  exec node "commands/$name.mjs" "$@"
}

cmd=${1:-serve}
[ "$#" -gt 0 ] && shift

case "$cmd" in
  serve)
    node commands/serve-check.mjs
    if [ "${MIGRATE_ON_START:-true}" != "false" ]; then
      node commands/migrate.mjs
    fi
    exec node server.js
    ;;
  migrate | seed | scheduler | tick | feed-scan | packs-check | import-applications)
    run_bundle "$cmd" "$@"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 64
    ;;
esac
