import { NextRequest } from "next/server";
import { config, proxy } from "../../proxy";

export type NoSessionRoute = {
  id: string;
  ships: string;
  path: string;
  method: "GET" | "POST" | "PUT";
  mechanism: "matcher" | "public_paths";
  why: string;
  check: string;
  existsAny: string[];
};

export type RouteProblem = { id: string; path: string; problem: string };

export function proxyRunsOn(pathname: string): boolean {
  return new RegExp("^" + config.matcher[0]).test(pathname);
}

export function isTested(row: NoSessionRoute, exists: (file: string) => boolean): boolean {
  return row.existsAny.some(exists);
}

// Returns one problem per tested row the proxy would answer with a redirect
// (or, for a matcher row, would run on at all). Rows whose route is not in the
// repo yet are skipped. Task 37's smoke script applies the same rule to the
// same JSON against a running container.
export function routeProblems(
  rows: NoSessionRoute[],
  exists: (file: string) => boolean,
): RouteProblem[] {
  const problems: RouteProblem[] = [];
  for (const row of rows) {
    if (!isTested(row, exists)) continue;
    if (row.mechanism === "matcher") {
      if (proxyRunsOn(row.path)) {
        problems.push({
          id: row.id,
          path: row.path,
          problem: "the proxy matcher runs on this path, add it to the matcher exclusion",
        });
      }
      continue;
    }
    const response = proxy(
      new NextRequest(new URL(row.path, "http://localhost:3000"), { method: row.method }),
    );
    if (response.headers.get("location") || response.headers.get("x-middleware-next") !== "1") {
      problems.push({
        id: row.id,
        path: row.path,
        problem: "the proxy redirects this path, add it to PUBLIC_PATHS",
      });
    }
  }
  return problems;
}
