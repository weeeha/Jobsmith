import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import rows from "../fixtures/no-session-routes.json";
import {
  isTested,
  routeProblems,
  type NoSessionRoute,
} from "../helpers/no-session-routes";

const table = rows as NoSessionRoute[];
const exists = (file: string) => existsSync(path.join(process.cwd(), file));

describe("no-session route table", () => {
  it("has exactly the eight spec rows by id", () => {
    expect([...new Set(table.map((row) => row.id))].sort()).toEqual(
      [
        "auth",
        "bridge",
        "debrief-upload",
        "feed-posts",
        "health",
        "hosted-pages",
        "hosted-posts",
        "manifest-icons",
      ].sort(),
    );
  });

  it("every row whose route exists passes through the proxy without a redirect to /login", () => {
    expect(routeProblems(table, exists)).toEqual([]);
  });

  for (const row of table) {
    if (isTested(row, exists)) continue;
    it.skip(`${row.id} ${row.method} ${row.path} (missing: ${row.existsAny.join(" or ")})`, () => {});
  }

  it("at least the Core rows are tested", () => {
    const tested = table.filter((row) => isTested(row, exists)).map((row) => row.id);
    expect(tested).toContain("auth");
    expect(tested).toContain("bridge");
  });

  it("a protected page still redirects to /login with ?from=", () => {
    const response = proxy(new NextRequest("http://localhost:3000/board"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/board");
  });

  it("a planted route in the table that the proxy would redirect is reported by name", () => {
    const planted: NoSessionRoute[] = [
      {
        id: "planted-matcher",
        ships: "Test",
        path: "/api/not-excluded",
        method: "POST",
        mechanism: "matcher",
        why: "planted",
        check: "planted",
        existsAny: ["package.json"],
      },
      {
        id: "planted-page",
        ships: "Test",
        path: "/not-public",
        method: "GET",
        mechanism: "public_paths",
        why: "planted",
        check: "planted",
        existsAny: ["package.json"],
      },
    ];
    const problems = routeProblems(planted, exists);
    expect(problems.map((p) => p.id)).toEqual(["planted-matcher", "planted-page"]);
  });
});
