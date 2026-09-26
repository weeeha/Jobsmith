import fs from "node:fs";
import path from "node:path";
import { ok, fail } from "@/lib/result";
import type { GuardedFetch, GuardOptions, FetchFailure } from "@/lib/intake/fetch-guard";

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intake", name), "utf-8");
}

export type FakeRoute = { contentType: "html" | "json"; body: string; status?: number } | FetchFailure;

export function fakeGuardedFetch(routes: Record<string, FakeRoute>): GuardedFetch & { calls: { url: string; options: GuardOptions }[] } {
  const calls: { url: string; options: GuardOptions }[] = [];
  const fetchFn = (async (url: string, options: GuardOptions) => {
    calls.push({ url, options });
    const route = routes[url];
    if (route === undefined) return fail("network_error", "network_error");
    if (typeof route === "string") return fail(route, route);
    return ok({ url, status: route.status ?? 200, contentType: route.contentType, body: route.body, redirects: 0 });
  }) as GuardedFetch & { calls: typeof calls };
  fetchFn.calls = calls;
  return fetchFn;
}
