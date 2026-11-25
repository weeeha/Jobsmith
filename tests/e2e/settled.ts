import { test as base, expect, type Request } from "@playwright/test";

export * from "@playwright/test";

/**
 * `test` whose `page.goto` first waits for the page's in-flight router
 * requests to finish: React Server Components fetches (header `RSC: 1`) and
 * server actions (header `Next-Action`).
 *
 * Why: many Prep actions end with `router.refresh()`. When a spec calls
 * `page.goto` while that refresh or action is still loading, the browser
 * aborts the fetch, and Next.js answers a failed router fetch with a full
 * navigation to the URL it was fetching. WebKit can abort before `pagehide`,
 * so that navigation lands and Playwright reports "interrupted by another
 * navigation". A person clicking an in-app link never hits this: those
 * navigations are client-side and do not abort the refresh.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const pending = new Set<Request>();
    const isRouterFetch = (request: Request) => {
      const headers = request.headers();
      return headers["rsc"] === "1" || "next-action" in headers;
    };
    page.on("request", (request) => {
      if (isRouterFetch(request)) pending.add(request);
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));

    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      await expect.poll(() => pending.size, { timeout: 15_000, message: "router requests still loading" }).toBe(0);
      return goto(url, options);
    };
    await provide(page);
  },
});
