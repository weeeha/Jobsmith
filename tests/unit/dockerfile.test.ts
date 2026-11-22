import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const ignore = readFileSync(path.join(root, ".dockerignore"), "utf8");
const placeholders = JSON.parse(readFileSync(path.join(root, "scripts/image-placeholders.json"), "utf8")) as {
  databaseUrl: string;
  secret: string;
  appUrl: string;
};

// The text of one stage, from its FROM line to the next FROM or the end.
function stage(name: string): string {
  const re = new RegExp(`^FROM .* AS ${name}$`, "m");
  const m = re.exec(dockerfile);
  if (!m) throw new Error(`no stage ${name}`);
  const rest = dockerfile.slice(m.index + m[0].length);
  const next = rest.search(/^FROM /m);
  return m[0] + (next === -1 ? rest : rest.slice(0, next));
}

describe("Dockerfile", () => {
  it("has four stages named base, deps, build and runtime", () => {
    const names = [...dockerfile.matchAll(/^FROM .* AS (\w+)$/gm)].map((m) => m[1]);
    expect(names).toEqual(["base", "deps", "build", "runtime"]);
  });

  it("every FROM pins node:24-slim by digest", () => {
    const froms = dockerfile.match(/^FROM .*$/gm) ?? [];
    expect(froms).toHaveLength(4);
    for (const line of froms) expect(line).toMatch(/FROM node:24-slim@sha256:[0-9a-f]{64}/);
  });

  it("deps installs with pnpm install --frozen-lockfile and a BuildKit cache mount", () => {
    const deps = stage("deps");
    expect(deps).toMatch(/--mount=type=cache,[^\n]*\\?[\s\S]*pnpm install --frozen-lockfile/);
    expect(deps).toContain("pnpm install --frozen-lockfile");
  });

  it("the build stage sets JOBSMITH_STANDALONE=1, NEXT_TELEMETRY_DISABLED=1 and the placeholders from scripts/image-placeholders.json", () => {
    const build = stage("build");
    expect(build).toContain("JOBSMITH_STANDALONE=1");
    expect(build).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(build).toContain(placeholders.databaseUrl);
    expect(build).toContain(placeholders.secret);
    expect(build).toContain(placeholders.appUrl);
    expect(placeholders.secret.length).toBe(34);
  });

  it("the placeholders appear in the build stage only", () => {
    const outside = dockerfile.replace(stage("build"), "");
    for (const value of Object.values(placeholders)) expect(outside).not.toContain(value);
    expect(outside).not.toContain("build.invalid");
    const runtime = stage("runtime");
    expect(runtime).not.toMatch(/DATABASE_URL|BETTER_AUTH_SECRET|APP_URL/);
  });

  it("the build stage runs pnpm build, pnpm scripts:build and pnpm licenses:collect and copies public and .next/static into the standalone folder", () => {
    const build = stage("build");
    expect(build).toMatch(/pnpm build\b/);
    expect(build).toContain("pnpm scripts:build");
    expect(build).toContain("pnpm licenses:collect");
    expect(build).toMatch(/cp -r public \.next\/standalone\/public/);
    expect(build).toMatch(/cp -r \.next\/static \.next\/standalone\/\.next\/static/);
  });

  it("the runtime stage sets NODE_ENV production, PORT 3000, HOSTNAME 0.0.0.0, NEXT_TELEMETRY_DISABLED 1 and STORAGE_LOCAL_DIR /data/storage", () => {
    const runtime = stage("runtime");
    expect(runtime).toContain("NODE_ENV=production");
    expect(runtime).toContain("PORT=3000");
    expect(runtime).toContain("HOSTNAME=0.0.0.0");
    expect(runtime).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(runtime).toContain("STORAGE_LOCAL_DIR=/data/storage");
  });

  it("JOBSMITH_VERSION and JOBSMITH_COMMIT are build args that become env values and OCI labels source, version, revision and licenses=AGPL-3.0-only", () => {
    const runtime = stage("runtime");
    expect(runtime).toMatch(/^ARG JOBSMITH_VERSION/m);
    expect(runtime).toMatch(/^ARG JOBSMITH_COMMIT/m);
    expect(runtime).toMatch(/JOBSMITH_VERSION=\$\{?JOBSMITH_VERSION\}?/);
    expect(runtime).toMatch(/JOBSMITH_COMMIT=\$\{?JOBSMITH_COMMIT\}?/);
    expect(runtime).toContain("org.opencontainers.image.source=");
    expect(runtime).toMatch(/org\.opencontainers\.image\.version="?\$\{?JOBSMITH_VERSION/);
    expect(runtime).toMatch(/org\.opencontainers\.image\.revision="?\$\{?JOBSMITH_COMMIT/);
    expect(runtime).toContain("org.opencontainers.image.licenses=AGPL-3.0-only");
  });

  it("runs as user node, owns /data, copies migrations beside the commands, and has the HEALTHCHECK with interval 30s timeout 5s start-period 60s retries 3 against /api/health", () => {
    const runtime = stage("runtime");
    expect(runtime).toMatch(/^USER node$/m);
    expect(runtime).toMatch(/mkdir -p \/data\/storage && chown -R node:node \/data/);
    expect(runtime).toContain("lib/db/migrations /app/commands/migrations");
    expect(runtime).toMatch(/COPY --from=build --chown=node:node \/app\/commands \/app\/commands/);
    expect(runtime).toContain("docker-entrypoint.sh");
    expect(runtime).toContain("THIRD_PARTY_LICENSES.txt");
    expect(runtime).toMatch(/^ENTRYPOINT \["\.\/docker-entrypoint\.sh"\]$/m);
    const hc = runtime.match(/^HEALTHCHECK (?:[^\n]*\\\n)*[^\n]*/m)?.[0] ?? "";
    expect(hc).toContain("--interval=30s");
    expect(hc).toContain("--timeout=5s");
    expect(hc).toContain("--start-period=60s");
    expect(hc).toContain("--retries=3");
    expect(hc).toContain("/api/health");
  });
});

describe(".dockerignore", () => {
  it("drops .env*, .git, node_modules, .next, tests, docs, .claude, .superpowers and cli/dist", () => {
    const lines = ignore.split("\n").map((l) => l.trim());
    for (const entry of [".env*", ".git", "node_modules", ".next", "tests", "docs", ".claude", ".superpowers", "cli/dist"]) {
      expect(lines).toContain(entry);
    }
  });
});
