# Self-hosting Jobsmith

**TL;DR.** You need a Linux machine with Docker and a domain. Copy the `deploy/` folder to `/opt/jobsmith`, fill in `.env`, run `docker compose --profile proxy up -d`, then open `https://<your domain>/setup` and create the first account with your setup token. Back up every night with `backup.sh`, and copy the backups to another machine.

This guide covers what ships today: the app, Postgres and Caddy in one compose stack, backup and restore scripts, and the image. A scheduler service, role packs, the speech container and the local runner units arrive with later milestones; each is marked below where it would belong.

## Requirements

- A Linux machine you control, with Docker Engine 24 or newer and Compose v2 (`docker compose version` prints it).
- A domain with an A record that points at the machine, for example `jobs.example.com`.
- Ports 80, 443 and 443/udp open to the internet. Caddy needs 80 and 443 to get its certificate, and 443/udp serves HTTP/3.

## Get the files

The stack lives in the `deploy/` folder of the repository. Take the folder, not the source:

```bash
git clone --depth 1 --branch v<version> https://github.com/weeeha/jobsmith.git
sudo mkdir -p /opt/jobsmith
sudo cp -R jobsmith/deploy/. /opt/jobsmith/
sudo chown -R "$USER" /opt/jobsmith
cd /opt/jobsmith
```

Replace `<version>` with the release you want, for example the newest tag on the releases page. Every command below runs in `/opt/jobsmith`.

## Configure

```bash
cp env.example .env
chmod 600 .env
```

The file holds secrets, so keep it at mode 600 and out of version control. Make the secrets on the machine:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 24   # SETUP_TOKEN
openssl rand -hex 16      # POSTGRES_PASSWORD
```

`POSTGRES_PASSWORD` goes into a database URL, so use letters and digits only: `openssl rand -hex 16` gives that, where base64 can add `+`, `/` and `=`. Then edit `.env` and set:

| Variable | Value |
|---|---|
| `JOBSMITH_DOMAIN` | your domain, for example `jobs.example.com` |
| `ACME_EMAIL` | an address Let's Encrypt can reach about your certificate |
| `APP_URL` | `https://<your domain>`, with no trailing slash |
| `BETTER_AUTH_SECRET` | the first value above (32 or more characters) |
| `SETUP_TOKEN` | the second value above (16 or more characters) |
| `POSTGRES_PASSWORD` | the third value above |

`DATABASE_URL` is not in `.env`: compose builds it from `POSTGRES_PASSWORD`. Every other variable is optional and listed in the table further down.

## Start

```bash
docker compose --profile proxy up -d
docker compose ps
```

Run `docker compose ps` again until `app` and `postgres` show `healthy`. The first start can take a minute: the app checks the schema and applies migrations before it listens. Caddy gets its certificate on the first request to your domain.

Open `https://<your domain>/setup`, enter the setup token, and create the account. After that, `/setup` closes. Anyone else who wants an account needs `ALLOW_SIGNUP=true`, which you set in `.env` and then apply with `docker compose up -d`.

To try the app without Caddy, leave out `--profile proxy`, uncomment the `ports` line of `app` in `compose.yaml`, and open `http://localhost:3000`. The port binds to this machine only.

## Demo data

To fill a fresh instance with fictional jobs:

```bash
docker compose run --rm app seed
```

It creates a demo user and prints a generated password once. Copy it then: it is not shown again. Do not seed an instance that holds a real search.

## Packs

Role packs arrive with the packs milestone. Until then the compose file already mounts `./packs` at `/packs` and sets `PACKS_DIR`, and the app ignores the folder. The pack check command and the pack option of `seed` are not part of this build.

## Backups

`backup.sh` writes a database dump and a storage archive to `backups/`, database first, and keeps 14 days of them (`KEEP_DAYS` changes that). Run it once by hand to see it work:

```bash
./backup.sh
```

Then add the nightly run to the crontab of the user that owns `/opt/jobsmith` (`crontab -e`):

```
15 3 * * * cd /opt/jobsmith && ./backup.sh >> backups/backup.log 2>&1
```

A backup on the same machine does not survive losing the machine. Copy `backups/` to another machine on a schedule, and encrypt the copies, for example with `age` or `gpg`, because the dump holds your data and the files you uploaded. Keep a copy of `.env` too, in a password manager: without `BETTER_AUTH_SECRET` the restored sessions and links stop working.

## Restore

Restore into a stack that is already running, so on a new machine do Get the files, Configure and Start first, with the same `.env` values. Copy the two backup files over, then:

```bash
./restore.sh backups/db-<ts>.dump backups/storage-<ts>.tar.gz
```

The script refuses a dump it cannot read, stops the app, replaces the database and the storage volume, and starts the app again. It overwrites what the stack holds now.

## Upgrade

1. Read the release notes of the version you are moving to.
2. Take a backup: `./backup.sh`.
3. Pull and restart:

```bash
docker compose pull && docker compose up -d
```

`JOBSMITH_TAG` in `.env` picks the image. The default `1` follows every 1.x release; pin a full tag such as `1.4.2` to move only when you choose. Add `--profile proxy` to the commands if you run Caddy, or set `COMPOSE_PROFILES=proxy` in `.env` once.

Migrations only move forward, so going back is a restore of the backup from step 2 plus the older tag in `JOBSMITH_TAG`. An older image refuses to start on a newer schema and prints: "Database schema is newer than this version (applied N, known M). Restore a backup or run a newer image."

## Postgres major upgrade

The stack runs Postgres 17. To move to another major version, dump, replace the data directory and load:

```bash
docker compose exec -T postgres pg_dump -U jobsmith -Fc jobsmith > pg-upgrade.dump
docker compose --profile proxy down
docker volume ls                        # find the volume that ends in pgdata
docker volume rm jobsmith_pgdata        # the name from the line above
```

Edit `compose.yaml`: change the `postgres` image to the new major version and remove the `@sha256` digest after it. Then:

```bash
docker compose up -d postgres
docker compose exec -T postgres pg_restore -U jobsmith -d jobsmith --clean --if-exists --no-owner < pg-upgrade.dump
docker compose --profile proxy up -d
```

Keep `pg-upgrade.dump` and a fresh `./backup.sh` result until you have checked the app.

## Other proxies

If you run nginx, Traefik or another proxy instead of Caddy, start without `--profile proxy` and publish the app port to the proxy. The login rate limit reads the client address from `X-Forwarded-For`, and trusts it only when it holds a single address. Make your proxy overwrite the header, for nginx:

```
proxy_set_header X-Forwarded-For $remote_addr;
```

Behind a chain of proxies, let each one append and list them in `trustedProxies`; the README section "Running behind a reverse proxy" has the detail.

The bundled Caddy accepts request bodies up to 32 MB. Interview recordings are capped by `TRANSCRIBE_MAX_MB` (25 by default). If you raise one, raise the other with it: the body limit in your proxy has to stay above the upload limit, or uploads fail at the proxy.

## Text to speech

The `tts` compose profile is not part of this build. Any OpenAI-compatible speech server works: set `TTS_PROVIDER=openai_compatible` and `TTS_BASE_URL` to its `/v1` address, for example `http://tts.internal:8880/v1`, and set `TTS_API_KEY` if it wants one.

## Local runner

The local runner is the `jobsmith work` command, which arrives with a later milestone. Its systemd and launchd units come with it.

## Source code

Jobsmith is AGPL-3.0. Section 13 asks an operator who changes the code and lets others use it over a network to offer those users the source. The app links to the source of the release it runs. If you run a modified build, set `SOURCE_URL` in `.env` to where your own source is published.

## Multi-replica

The stack runs one app container. If you run several replicas of your own build, build your own image with the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in every replica. This guide does not cover shared caches.

## Supported versions

Docker Engine 24, Compose v2 and Postgres 17. Postgres 16 runs the same migrations and is untested.

## Troubleshooting

- Read the app's log first: `docker compose logs app`. An invalid or missing setting stops the start with an `EnvError` line that names the variable.
- Check the health route from inside the network: `docker compose exec app node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>console.log(r.status))'`. It prints 200 when the app is up. The image has no `curl`; on a machine where the app port is published, `curl http://localhost:3000/api/health` does the same.
- Caddy log: `docker compose logs caddy`. A certificate that does not arrive usually means the A record or port 80 is not reachable from the internet.
- `docker compose restart app` restarts the container but does not re-read `.env`; after editing `.env`, run `docker compose up -d` instead. A scheduler service arrives with the hosted milestone; until then `app` is the only service to restart.

## Environment variables

Keep the `.env` file that holds these at mode 600 (`chmod 600 .env`), since it holds secrets.

The root `.env.example` is the full reference. The table lists every variable the app reads from an operator. "Hosted only" marks variables that matter only to the paid hosted service; a self-hosted instance leaves them unset. `PACKS_DIR` takes effect once the role packs milestone is part of your build; until then the app ignores it.

<!-- env-table:start -->
| Variable | Needed for | Default | Hosted only | From |
|---|---|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | always (compose builds it); migrations behind a pooler | none; `DATABASE_URL` | no | Core |
| `BETTER_AUTH_SECRET` | always, 32 or more characters; also keys Feed's unsubscribe links and Debrief's upload tokens | none | no | Core |
| `APP_URL` | always off Vercel; emailed, Telegram and MCP origin links | Vercel's system URL on Vercel | no | Core |
| `SETUP_TOKEN` | the first account on a production build, 16 or more | unset locks `/setup` | no | Core |
| `ALLOW_SIGNUP`, `AUTH_SIGNIN_MAX_PER_MINUTE` | later accounts when self-hosted; sign-in tuning | `false` (ignored when hosted); 5 | no | Core |
| `AI_PROVIDER`; `AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`; `AI_MODEL`, `AI_MODEL_WRITE` | extraction, scoring, onboarding, generation, debrief suggestions | off; gateway uses OIDC on Vercel; Haiku 4.5, Sonnet 5 | no | Core, Hosted |
| `TTS_PROVIDER`; `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`; `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` | generated voices; `openai_compatible` base URL and optional key; the other drivers' keys | off (browser voices); model per driver | no | Prep |
| `TRANSCRIBE_PROVIDER`; `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY`, `TRANSCRIBE_MODEL`, `TRANSCRIBE_MAX_MB`, `TRANSCRIBE_TIMEOUT_S` | recorded interviews | off; `whisper-1`, 25 (at most 200), 240 | no | Debrief |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR` | audio, recordings, exports | `local` (refused when VERCEL is set); `.jobsmith/storage` from source, `/data/storage` in the image | no | Prep; Widen names the directory |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`; `BLOB_READ_WRITE_TOKEN` | `s3`; `vercel_blob` | region `auto`, path style `false`; the token comes from the Vercel Blob store | no | Widen names them |
| `HOSTED` | the paid service | off | yes | Hosted |
| `EMAIL_PROVIDER`, `EMAIL_FROM`; `SMTP_URL` or `RESEND_API_KEY` | password reset when self-hosted, required when hosted, Feed's email digests | off | no | Hosted |
| `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PLUS` | billing | off | yes | Hosted |
| `ADMIN_EMAILS`, `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING`, `SIGNUP_INVITE_CODE`, `CREDITS_GLOBAL_DAILY_CAP` | admin and legal pages; an invite-only beta; the daily spend breaker | none; open; 20,000 | yes | Hosted |
| `CRON_SECRET` | the HTTP tick, 32 or more characters | unset: the route is 404, and the compose scheduler needs none | required when hosted | Hosted |
| `NOTIFY_CHANNELS`; `TELEGRAM_BOT_TOKEN`, `TELEGRAM_UPDATES`, `TELEGRAM_WEBHOOK_SECRET`; `FEED_SCAN`, `FEED_SCORES_PER_DAY_MAX` | alerts; the scan kill switch; the instance score ceiling | in-app only, `poll`; on; 100 | no | Feed |
| `PACKS_DIR`, `SOURCE_URL`, `MIGRATE_ON_START`, `TICK_INTERVAL_MINUTES` | extra packs; the AGPL source link; the image's `serve` and `scheduler` | unset; the release tag's URL (the commit's on Vercel); `true`; 15 | no | Widen |
| `DEMO_MODE` | a public showcase instance only, never one that holds a real search | off | no | Core demo sign-in |
<!-- env-table:end -->

### Compose and Caddy only, and build only

<!-- env-table-extra:start -->
| Variable | Needed for | Default | Hosted only | From |
|---|---|---|---|---|
| Compose and Caddy only: `POSTGRES_PASSWORD`, `JOBSMITH_DOMAIN`, `ACME_EMAIL`, `JOBSMITH_TAG` | the stack; the domain and the ACME address are required with the `proxy` profile | tag `1` | no | Widen |
| Build only: `JOBSMITH_STANDALONE`, `JOBSMITH_VERSION`, `JOBSMITH_COMMIT`; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for an operator's own multi-replica build | the image | unset | no | Widen, Next |
<!-- env-table-extra:end -->
