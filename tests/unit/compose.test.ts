import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(path.join(process.cwd(), file), "utf8");
const compose = read("deploy/compose.yaml");

/** The text of one top-level service, up to the next service or section. */
function service(name: string): string {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^( {2}\S|\S)/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const live = (text: string): string =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

describe("deploy/compose.yaml", () => {
  it("app uses ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}, env_file .env, init true, restart unless-stopped, stop_grace_period 30s", () => {
    const app = service("app");
    expect(app).toContain("image: ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}");
    expect(app).toContain("env_file: .env");
    expect(app).toContain("init: true");
    expect(app).toContain("restart: unless-stopped");
    expect(app).toContain("stop_grace_period: 30s");
  });

  it("app is read_only with tmpfs /tmp and /app/.next/cache, cap_drop ALL and no-new-privileges, and has no ports", () => {
    const app = service("app");
    expect(app).toContain("read_only: true");
    expect(app).toMatch(/tmpfs:\n\s+- \/tmp\n\s+- \/app\/\.next\/cache/);
    expect(app).toMatch(/cap_drop:\n\s+- ALL/);
    expect(app).toContain("no-new-privileges:true");
    expect(live(app)).not.toMatch(/^\s*ports:/m);
  });

  it("app mounts storage:/data and ./packs:/packs:ro and sets PACKS_DIR=/packs", () => {
    const app = service("app");
    expect(app).toContain("- storage:/data");
    expect(app).toContain("- ./packs:/packs:ro");
    expect(app).toContain("PACKS_DIR: /packs");
  });

  it("app depends on postgres being healthy", () => {
    expect(service("app")).toMatch(/depends_on:\n\s+postgres:\n\s+condition: service_healthy/);
  });

  it("postgres is postgres:17-alpine by digest, user and database jobsmith, POSTGRES_PASSWORD required with ${POSTGRES_PASSWORD:?}, volume pgdata, pg_isready every 5 seconds, no ports", () => {
    const pg = service("postgres");
    expect(pg).toMatch(/image: postgres:17-alpine@sha256:[0-9a-f]{64}/);
    expect(pg).toContain("POSTGRES_USER: jobsmith");
    expect(pg).toContain("POSTGRES_DB: jobsmith");
    expect(pg).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}");
    expect(pg).toContain("- pgdata:/var/lib/postgresql/data");
    expect(pg).toContain("pg_isready");
    expect(pg).toContain("interval: 5s");
    expect(live(pg)).not.toMatch(/^\s*ports:/m);
  });

  // Task 31 did not wire the scheduler (hosted milestone 11 is not built), so
  // compose has no scheduler service yet. Un-skip this when it does.
  it.skip("scheduler is the same image with command scheduler, depends on app healthy and sets TICK_INTERVAL_MINUTES (skipped: the scheduler is not built, hosted milestone 11)", () => {
    const scheduler = service("scheduler");
    expect(scheduler).toContain("image: ghcr.io/weeeha/jobsmith:${JOBSMITH_TAG:-1}");
    expect(scheduler).toContain("command: scheduler");
    expect(scheduler).toMatch(/depends_on:\n\s+app:\n\s+condition: service_healthy/);
    expect(scheduler).toContain("TICK_INTERVAL_MINUTES");
  });

  it("has no scheduler or tts service until each is confirmed", () => {
    expect(service("scheduler")).toBe("");
    expect(service("tts")).toBe("");
  });

  it("caddy is in profile proxy with ports 80, 443 and 443/udp and volumes caddy_data and caddy_config", () => {
    const caddy = service("caddy");
    expect(caddy).toContain('profiles: ["proxy"]');
    expect(caddy).toContain('- "80:80"');
    expect(caddy).toContain('- "443:443"');
    expect(caddy).toContain('- "443:443/udp"');
    expect(caddy).toContain("- caddy_data:/data");
    expect(caddy).toContain("- caddy_config:/config");
  });

  it("declares the volumes pgdata, storage, caddy_data and caddy_config", () => {
    const volumes = compose.slice(compose.indexOf("\nvolumes:"));
    for (const name of ["pgdata", "storage", "caddy_data", "caddy_config"]) {
      expect(volumes).toContain(`  ${name}:`);
    }
  });

  it("every image in deploy/compose.yaml is pinned by digest, except the app image which is chosen by JOBSMITH_TAG", () => {
    const images = [...compose.matchAll(/^\s+image: (\S+)/gm)].map((m) => m[1]);
    expect(images.length).toBe(3);
    for (const image of images) {
      if (image.startsWith("ghcr.io/weeeha/jobsmith:")) continue;
      expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  });

  it("the Caddyfile equals the spec 5.8 block", () => {
    expect(read("deploy/Caddyfile")).toBe(
      [
        "{$JOBSMITH_DOMAIN} {",
        "\ttls {$ACME_EMAIL}",
        '\theader Strict-Transport-Security "max-age=31536000"',
        "\trequest_body {",
        "\t\tmax_size 32MB",
        "\t}",
        "\treverse_proxy app:3000 {",
        "\t\theader_up X-Forwarded-For {remote_host}",
        "\t}",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("env.example names every compose variable and DATABASE_URL is not in it", () => {
    const example = read("deploy/env.example");
    const names = new Set(
      example
        .split("\n")
        .map((line) => line.replace(/^#\s*/, "").match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
        .filter((n): n is string => Boolean(n)),
    );
    const used = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(names, name).toContain(name);
    for (const name of ["POSTGRES_PASSWORD", "JOBSMITH_DOMAIN", "ACME_EMAIL", "JOBSMITH_TAG", "APP_URL", "BETTER_AUTH_SECRET", "SETUP_TOKEN", "AI_PROVIDER", "STORAGE_PROVIDER"]) {
      expect(names, name).toContain(name);
    }
    expect(example).not.toMatch(/^#?\s*DATABASE_URL=/m);
    expect(example).toMatch(/chmod 600/);
  });

  it("compose.ci.yaml publishes only 127.0.0.1:3000 for app and 127.0.0.1:5432 for postgres", () => {
    const ci = read("deploy/compose.ci.yaml");
    expect(ci).toContain('- "127.0.0.1:3000:3000"');
    expect(ci).toContain('- "127.0.0.1:5432:5432"');
  });

  it("the root docker-compose.yml and ci.yml use postgres:17-alpine", () => {
    expect(read("docker-compose.yml")).toContain("image: postgres:17-alpine");
    expect(read(".github/workflows/ci.yml")).toContain("image: postgres:17-alpine");
    expect(read("docker-compose.yml")).not.toContain("postgres:16");
    expect(read(".github/workflows/ci.yml")).not.toContain("postgres:16");
  });
});
