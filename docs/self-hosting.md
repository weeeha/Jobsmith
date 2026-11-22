# Self-hosting Jobsmith

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
