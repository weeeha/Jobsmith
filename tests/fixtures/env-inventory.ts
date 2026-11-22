// The operator-facing environment variables, from spec 5.11 of the Widen
// design. The inventory test compares every config parser's ENV_NAMES against
// this list, .env.example and docs/self-hosting.md.

// The 60 names, in the order of the spec's table.
export const APP_VARIABLES = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "APP_URL",
  "SETUP_TOKEN",
  "ALLOW_SIGNUP",
  "AUTH_SIGNIN_MAX_PER_MINUTE",
  "AI_PROVIDER",
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_MODEL",
  "AI_MODEL_WRITE",
  "TTS_PROVIDER",
  "TTS_BASE_URL",
  "TTS_API_KEY",
  "TTS_MODEL",
  "GEMINI_API_KEY",
  "ELEVENLABS_API_KEY",
  "TRANSCRIBE_PROVIDER",
  "TRANSCRIBE_BASE_URL",
  "TRANSCRIBE_API_KEY",
  "TRANSCRIBE_MODEL",
  "TRANSCRIBE_MAX_MB",
  "TRANSCRIBE_TIMEOUT_S",
  "STORAGE_PROVIDER",
  "STORAGE_LOCAL_DIR",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "BLOB_READ_WRITE_TOKEN",
  "HOSTED",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "SMTP_URL",
  "RESEND_API_KEY",
  "BILLING_PROVIDER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PLUS",
  "ADMIN_EMAILS",
  "LEGAL_OPERATOR",
  "LEGAL_CONTACT_EMAIL",
  "LEGAL_HOSTING",
  "SIGNUP_INVITE_CODE",
  "CREDITS_GLOBAL_DAILY_CAP",
  "CRON_SECRET",
  "NOTIFY_CHANNELS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_UPDATES",
  "TELEGRAM_WEBHOOK_SECRET",
  "FEED_SCAN",
  "FEED_SCORES_PER_DAY_MAX",
  "PACKS_DIR",
  "SOURCE_URL",
  "MIGRATE_ON_START",
  "TICK_INTERVAL_MINUTES",
] as const;

// Read by docker compose and Caddy, not by the app.
export const COMPOSE_VARIABLES = [
  "POSTGRES_PASSWORD",
  "JOBSMITH_DOMAIN",
  "ACME_EMAIL",
  "JOBSMITH_TAG",
] as const;

// Read at image build time only.
export const BUILD_VARIABLES = [
  "JOBSMITH_STANDALONE",
  "JOBSMITH_VERSION",
  "JOBSMITH_COMMIT",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
] as const;

// Read by the code but never set by an operator: the platform's and the
// image's own variables, the scripts' and tests' switches, and the CLI's
// variables on the user's own machine.
export const NOT_OPERATOR = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "NODE_ENV",
  "PORT",
  "HOSTNAME",
  "NEXT_TELEMETRY_DISABLED",
  "ALLOW_DB_RESET",
  "SEED_PASSWORD",
  "JOBSMITH_LIVE_AI",
  "CI",
  "EMAIL_FAKE_DIR",
  "TRANSCRIBE_FAKE_WAIT_MS",
  "FEED_FETCH",
  "FEED_FIXTURES",
  "FEED_LIVE_GREENHOUSE_ORG",
  "FEED_LIVE_LEVER_ORG",
  "FEED_LIVE_ASHBY_ORG",
  "JOBSMITH_URL",
  "JOBSMITH_TOKEN",
  "JOBSMITH_STT_URL",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
] as const;

// Names the code reads that the spec's table of 60 lacks. DEMO_MODE is the
// demo sign-in, added after the spec (README "Spec ambiguities"); the owner
// confirms or removes it.
export const EXTRA_SINCE_SPEC = ["DEMO_MODE"] as const;
