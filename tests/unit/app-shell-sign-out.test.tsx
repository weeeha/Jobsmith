// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";
import { clearOfflineData } from "@/lib/offline/clear";

vi.mock("next/navigation", () => ({ usePathname: () => "/board", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/lib/offline/clear", () => ({ clearOfflineData: vi.fn() }));
// The real account menu is a dropdown; the shell only hands it onSignOut.
vi.mock("@/components/super-ai/account-menu", () => ({
  AccountMenu: (p: { onSignOut: () => void }) => (
    <button type="button" onClick={p.onSignOut}>
      Sign out
    </button>
  ),
}));

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});
afterEach(cleanup);

describe("AppShell sign-out", () => {
  it("the sign-out control clears offline data before it signs out", async () => {
    const order: string[] = [];
    vi.mocked(clearOfflineData).mockImplementation(async (hash) => {
      order.push(`clear:${hash}`);
      await Promise.resolve();
      order.push("cleared");
      return { deleted: [] };
    });
    const onSignOut = vi.fn(() => {
      order.push("signout");
    });
    render(
      <AppShell email="a@example.test" userHash="aaaa" onSignOut={onSignOut}>
        <p>page</p>
      </AppShell>,
    );
    await act(async () => screen.getByRole("button", { name: "Sign out" }).click());
    expect(order).toEqual(["clear:aaaa", "cleared", "signout"]);
  });

  it("still signs out when clearing throws", async () => {
    vi.mocked(clearOfflineData).mockRejectedValue(new Error("boom"));
    const onSignOut = vi.fn();
    render(
      <AppShell email="a@example.test" userHash="aaaa" onSignOut={onSignOut}>
        <p>page</p>
      </AppShell>,
    );
    await act(async () => screen.getByRole("button", { name: "Sign out" }).click());
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
