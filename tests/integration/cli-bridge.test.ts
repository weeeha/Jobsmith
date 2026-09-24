import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { run } from "@/cli/src/main";
import { configPath, readCredentials } from "@/cli/src/config";
import { USAGE } from "@/cli/src/args";
import type { CliIo } from "@/cli/src/io";

const PACKET_DIR = path.resolve(import.meta.dirname, "../fixtures/packet");

function testDeps(db: Db): { deps: BridgeDeps } {
  let counter = 0;
  return {
    deps: {
      db,
      now: () => new Date(),
      revalidate: () => {},
      requestId: () => `req-${++counter}`,
    },
  };
}

async function seedJob(db: Db, opts: { slug: string; email: string }) {
  const user = await createTestUser(db, opts.email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Northwind Labs", nameKey: `northwind-${opts.slug}` });
  const opportunity = await s.opportunity.insert({ companyId: company.id, slug: opts.slug, roleTitle: "Product Designer" });
  const drafts = defaultStages();
  const stages = await s.stage.insertMany(
    drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { user, s, opportunity, token: created.data.token };
}

async function testHome(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "jobsmith-home-"));
}

function buildIo(db: Db, overrides: Partial<CliIo> = {}): CliIo {
  const { deps } = testDeps(db);
  return {
    fetch: bridgeFetch(deps),
    env: {},
    cwd: "/",
    homedir: "/unused",
    stdout: () => {},
    stderr: () => {},
    readSecret: async () => "",
    ...overrides,
  };
}

describe("jobsmith login", () => {
  it("writes a 0600 credentials file and prints the confirmation line", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "login1@example.com" });
      const home = await testHome();
      const out: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        readSecret: async () => `${token}\n`,
        stdout: (t) => out.push(t),
      });

      const code = await run(["login", "--url", "http://test.local"], io);
      expect(code).toBe(0);
      expect(out.join("")).toBe("Logged in to http://test.local. Saved to " + configPath(io.env, home) + ".\n");

      const file = configPath(io.env, home);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ url: "http://test.local", token });
    } finally {
      await close();
    }
  });

  it("refuses a token that does not look like a Jobsmith token, before any request", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const err: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        readSecret: async () => "not-a-real-token",
        stderr: (t) => err.push(t),
      });
      const code = await run(["login", "--url", "http://test.local"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("That does not look like a Jobsmith token.\n");
    } finally {
      await close();
    }
  });

  it("treats standard input closing with no line the same as an unrecognized token, not a hang", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const err: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        // What readLineOrEmpty resolves when stdin is redirected from
        // something like /dev/null and closes without ever sending a line.
        readSecret: async () => "",
        stderr: (t) => err.push(t),
      });
      const code = await run(["login", "--url", "http://test.local"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("That does not look like a Jobsmith token.\n");
    } finally {
      await close();
    }
  });

  it("refuses a 200 answer that is not a Jobsmith opportunities list, and saves nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const err: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config") },
        homedir: home,
        // A proxy redirected the login request to an HTML sign-in page,
        // which answered 200 before fetch had a chance to notice anything
        // was wrong: this is the same shape a login --url pointed at a page
        // path (rather than the bare origin) would see.
        fetch: (async () => new Response("<html><body>Sign in</body></html>", { status: 200 })) as typeof fetch,
        readSecret: async () => `jsm_${"A".repeat(43)}\n`,
        stderr: (t) => err.push(t),
      });
      const code = await run(["login", "--url", "http://test.local/settings"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("That URL did not answer like Jobsmith. Check the address.\n");
      expect(await readCredentials(io)).toBeNull();
    } finally {
      await close();
    }
  });
});

describe("jobsmith list / pull / push", () => {
  it("list prints the seeded job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "list1@example.com" });
      const home = await testHome();
      const out: string[] = [];
      const io = buildIo(db, {
        env: { XDG_CONFIG_HOME: path.join(home, "config"), JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });
      const code = await run(["list"], io);
      expect(code).toBe(0);
      expect(out.join("")).toContain("nwl-designer");
      expect(out.join("")).toContain("Product Designer at Northwind Labs");
    } finally {
      await close();
    }
  });

  it("list reports a non-JSON 200 body as an unreadable reply rather than throwing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "list2@example.com" });
      const err: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        fetch: (async () => new Response("not json", { status: 200 })) as typeof fetch,
        stderr: (t) => err.push(t),
      });
      const code = await run(["list"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("Error: the server sent a reply the CLI could not read.\n");
    } finally {
      await close();
    }
  });

  it("pull writes <slug>-context.md under --out", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "pull1@example.com" });
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-pull-"));
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        cwd: outDir,
        stdout: (t) => out.push(t),
      });
      const code = await run(["pull", "nwl-designer", "--out", "."], io);
      expect(code).toBe(0);
      const filePath = path.join(outDir, "nwl-designer-context.md");
      expect(out.join("")).toBe(`Wrote ${filePath}.\n`);
      const content = await readFile(filePath, "utf8");
      expect(content).toContain("jobsmith: context/v1");
    } finally {
      await close();
    }
  });

  it("push of the fixture packet reports 11 created and one warning", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push1@example.com" });
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });

      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io);
      const printed = out.join("");
      expect(code).toBe(0);
      expect(printed).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");
      expect(printed).toContain(
        'Warning: debrief-round2: no stage matches "Final loop", stored without a stage.',
      );
      expect((printed.match(/^  created /gm) ?? []).length).toBe(11);

      const documents = await s.artifact.listLatestForOpportunity(opportunity.id);
      expect(documents).toHaveLength(10);
      const companyDocuments = await s.artifact.listLatestForCompany(opportunity.companyId);
      expect(companyDocuments.map((d) => d.key)).toEqual(["recon"]);
      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("push of the fixture packet stores the right kind, scope, stage and title for every document", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push4@example.com" });
      const io = buildIo(db, { env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token } });

      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io);
      expect(code).toBe(0);

      const stages = await s.stage.listForOpportunity(opportunity.id);
      const stageLabel = (stageId: string | null) => stages.find((st) => st.id === stageId)?.label ?? null;

      const opportunityDocs = await s.artifact.listLatestForOpportunity(opportunity.id);
      const byKey = (key: string) => {
        const row = opportunityDocs.find((d) => d.key === key);
        if (!row) throw new Error(`missing document ${key}`);
        return row;
      };

      // Research tab, "This job" group: not shared with the company.
      expect(byKey("fit-brief")).toMatchObject({ kind: "fit_brief", title: "Northwind Labs: fit brief" });
      expect(stageLabel(byKey("fit-brief").stageId)).toBeNull();
      expect(byKey("people")).toMatchObject({ kind: "people_notes", title: "Northwind Labs: people in the loop" });
      expect(stageLabel(byKey("people").stageId)).toBeNull();

      // Documents tab.
      expect(byKey("cv")).toMatchObject({ kind: "cv", title: "CV for Northwind Labs" });
      expect(byKey("cover-letter")).toMatchObject({ kind: "cover_letter", title: "Cover letter for Northwind Labs" });

      // Prep tab, General group: no stage matched (debrief-round2's "Final
      // loop" is not a real stage, which the other push test already
      // asserts as a warning).
      expect(byKey("answers-full")).toMatchObject({ kind: "question_bank", title: "Northwind Labs: full answers" });
      expect(stageLabel(byKey("answers-full").stageId)).toBeNull();
      expect(byKey("glossary")).toMatchObject({ kind: "glossary", title: "Northwind Labs: glossary" });
      expect(stageLabel(byKey("glossary").stageId)).toBeNull();
      expect(byKey("debrief-round2")).toMatchObject({ kind: "debrief", title: "Northwind Labs: round two debrief" });
      expect(stageLabel(byKey("debrief-round2").stageId)).toBeNull();

      // Prep tab, grouped by stage.
      expect(byKey("hr-bank")).toMatchObject({ kind: "question_bank", title: "Northwind Labs: recruiter screen questions" });
      expect(stageLabel(byKey("hr-bank").stageId)).toBe("Recruiter screen");
      expect(byKey("call-card")).toMatchObject({ kind: "call_card", title: "Northwind Labs: hiring manager call card" });
      expect(stageLabel(byKey("call-card").stageId)).toBe("Hiring manager");
      expect(byKey("pitch")).toMatchObject({ kind: "pitch", title: "Portfolio walkthrough pitch" });
      expect(stageLabel(byKey("pitch").stageId)).toBe("Portfolio review");

      // Shared with the whole company, not tied to this opportunity.
      const companyDocs = await s.artifact.listLatestForCompany(opportunity.companyId);
      expect(companyDocs).toHaveLength(1);
      expect(companyDocs[0]).toMatchObject({
        key: "recon",
        kind: "research",
        title: "Northwind Labs: company recon",
      });

      // Frontmatter never survives into the stored body, for either scope.
      for (const doc of [...opportunityDocs, ...companyDocs]) {
        const ref = doc.opportunityId ? { opportunityId: doc.opportunityId } : { companyId: doc.companyId! };
        const full = await s.artifact.getLatest(ref, doc.key);
        expect(full?.bodyMd.startsWith("---"), doc.key).toBe(false);
      }
    } finally {
      await close();
    }
  });

  it("push reports a non-JSON 200 body as an unreadable reply rather than throwing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const err: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: "placeholder-token" },
        fetch: (async () => new Response("not json", { status: 200 })) as typeof fetch,
        stderr: (t) => err.push(t),
      });
      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe("Error: the server sent a reply the CLI could not read.\n");
    } finally {
      await close();
    }
  });

  it("a second push of the same packet reports 11 unchanged and adds no second event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push2@example.com" });
      const io = () => buildIo(db, { env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token } });

      const first = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io());
      expect(first).toBe(0);

      const out: string[] = [];
      const second = await run(
        ["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl"],
        { ...io(), stdout: (t) => out.push(t) },
      );
      expect(second).toBe(0);
      expect(out.join("")).toContain("0 created, 0 versioned, 0 updated, 11 unchanged.");

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toHaveLength(10);
      expect(await s.artifact.listLatestForCompany(opportunity.companyId)).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("--dry-run reports what would happen and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, { slug: "nwl-designer", email: "push3@example.com" });
      const out: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stdout: (t) => out.push(t),
      });
      const code = await run(["push", "nwl-designer", "--dir", PACKET_DIR, "--prefix", "nwl", "--dry-run"], io);
      expect(code).toBe(0);
      const printed = out.join("");
      expect(printed).toContain("Dry run: nothing was saved.");
      expect(printed).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");

      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
      expect(await s.event.listForOpportunity(opportunity.id)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a revoked token exits 1 with the refused line, for list, pull and push alike", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token } = await seedJob(db, { slug: "nwl-designer", email: "revoked1@example.com" });
      const list = await s.apiToken.list();
      await revokeApiToken(s, list[0]!.id);
      const err: string[] = [];
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        stderr: (t) => err.push(t),
      });
      const code = await run(["list"], io);
      expect(code).toBe(1);
      expect(err.join("")).toBe(
        "The server refused the token. Create a new one in Settings and run jobsmith login.\n",
      );
    } finally {
      await close();
    }
  });

  it("list, pull and push all refuse to run before login, with the same message", async () => {
    const { db, close } = await makeTestDb();
    try {
      const home = await testHome();
      const argvByCommand = [["list"], ["pull", "nwl-designer"], ["push", "nwl-designer"]];
      for (const argv of argvByCommand) {
        const err: string[] = [];
        const io = buildIo(db, {
          env: { XDG_CONFIG_HOME: path.join(home, "config") },
          homedir: home,
          stderr: (t) => err.push(t),
        });
        expect(await run(argv, io), argv.join(" ")).toBe(1);
        expect(err.join(""), argv.join(" ")).toBe("Not logged in. Run jobsmith login first.\n");
      }
    } finally {
      await close();
    }
  });
});

describe("jobsmith pull / push slug handling", () => {
  it("pull and push work against a job whose slug keeps a non-ASCII letter", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, opportunity, token } = await seedJob(db, {
        slug: "ørsted-product-designer",
        email: "slug1@example.com",
      });
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-pull-"));
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        cwd: outDir,
      });

      const pullCode = await run(["pull", "ørsted-product-designer", "--out", "."], io);
      expect(pullCode).toBe(0);
      const filePath = path.join(outDir, "ørsted-product-designer-context.md");
      expect(await readFile(filePath, "utf8")).toContain("jobsmith: context/v1");

      const pushCode = await run(["push", "ørsted-product-designer", "--dir", PACKET_DIR, "--prefix", "nwl"], io);
      expect(pushCode).toBe(0);
      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toHaveLength(10);
    } finally {
      await close();
    }
  });

  it("rejects a slug shaped like a path traversal before any request or file write", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const { token } = await seedJob(db, { slug: "nwl-designer", email: "slug2@example.com" });
      const outDir = await mkdtemp(path.join(os.tmpdir(), "jobsmith-pull-"));
      let fetchCalls = 0;
      const io = buildIo(db, {
        env: { JOBSMITH_URL: "http://test.local", JOBSMITH_TOKEN: token },
        cwd: outDir,
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          fetchCalls++;
          return bridgeFetch(deps)(input, init);
        }) as typeof fetch,
      });

      const err: string[] = [];
      const pullCode = await run(["pull", "../x", "--out", "."], { ...io, stderr: (t) => err.push(t) });
      expect(pullCode).toBe(2);
      expect(err.join("")).toBe(`${USAGE}\n`);
      expect(fetchCalls).toBe(0);
      await expect(stat(path.resolve(outDir, "..", "x-context.md"))).rejects.toThrow();

      const pushErr: string[] = [];
      const pushCode = await run(
        ["push", "../x", "--dir", PACKET_DIR, "--prefix", "nwl"],
        { ...io, stderr: (t) => pushErr.push(t) },
      );
      expect(pushCode).toBe(2);
      expect(pushErr.join("")).toBe(`${USAGE}\n`);
      expect(fetchCalls).toBe(0);
    } finally {
      await close();
    }
  });
});
