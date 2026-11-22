#!/usr/bin/env node
// Smoke checks for the Jobsmith image, run by .github/workflows/image.yml.
//   image-smoke placeholders <root>      files under <root> holding a build-time placeholder
//   image-smoke routes <baseUrl>         no route of the table may send a visitor to /login
//   image-smoke size <image> <budget>    the image must not exceed <budget> bytes
// Plain Node, no dependencies, so it can run inside the image too.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SIZE_BUDGET_BYTES = 400 * 1024 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));

/** The strings the Dockerfile bakes in only so `next build` can run. */
export function placeholderNeedles(file = path.join(here, "image-placeholders.json")) {
  const p = JSON.parse(readFileSync(file, "utf8"));
  return ["build.invalid", p.secret].map((s) => Buffer.from(s));
}

/** Absolute paths of the files under `root` that contain a needle. */
export function findPlaceholders(root, needles = placeholderNeedles()) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        try {
          const buf = readFileSync(full);
          if (needles.some((n) => buf.includes(n))) hits.push(full);
        } catch {
          // unreadable file: skip it
        }
      }
    }
  };
  walk(root);
  return hits;
}

/** Rows of the route table whose answer is a 3xx to a /login location. */
export async function findLoginRedirects(baseUrl, rows) {
  const bad = [];
  for (const row of rows) {
    const url = new URL(row.path, baseUrl);
    const res = await fetch(url, {
      method: row.method,
      redirect: "manual",
      headers: row.method === "GET" ? {} : { "content-type": "application/json" },
      body: row.method === "GET" || row.method === "HEAD" ? undefined : "{}",
    });
    const location = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400 && location.includes("/login")) {
      bad.push({ id: row.id, method: row.method, path: row.path, status: res.status, location });
    }
  }
  return bad;
}

/** Size in bytes: a file's own size, or a docker image's. */
export function imageSize(image) {
  try {
    if (statSync(image).isFile()) return statSync(image).size;
  } catch {
    // not a file: ask docker
  }
  const out = execFileSync("docker", ["image", "inspect", "-f", "{{.Size}}", image], { encoding: "utf8" });
  return Number(out.trim());
}

async function main(argv) {
  const [cmd, a, b] = argv;
  if (cmd === "placeholders" && a) {
    const hits = findPlaceholders(a);
    for (const f of hits) console.log(f);
    if (hits.length) {
      console.error(`${hits.length} file(s) under ${a} hold a build placeholder`);
      return 1;
    }
    console.log(`no build placeholder under ${a}`);
    return 0;
  }
  if (cmd === "routes" && a) {
    const table = path.join(here, "..", "tests", "fixtures", "no-session-routes.json");
    const rows = JSON.parse(readFileSync(table, "utf8"));
    const bad = await findLoginRedirects(a, rows);
    for (const r of bad) console.error(`row ${r.id}: ${r.method} ${r.path} -> ${r.status} ${r.location}`);
    if (bad.length) return 1;
    console.log(`${rows.length} routes answered without a redirect to /login`);
    return 0;
  }
  if (cmd === "size" && a && b) {
    const budget = Number(b);
    if (!Number.isFinite(budget)) {
      console.error(`budget is not a number: ${b}`);
      return 64;
    }
    const size = imageSize(a);
    const mb = (n) => (n / 1024 / 1024).toFixed(1);
    if (size > budget) {
      console.error(`${a} is ${mb(size)} MB, over the ${mb(budget)} MB budget`);
      return 1;
    }
    console.log(`${a} is ${mb(size)} MB, within the ${mb(budget)} MB budget`);
    return 0;
  }
  console.error("usage: image-smoke placeholders <root> | routes <baseUrl> | size <image> <budgetBytes>");
  return 64;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}
