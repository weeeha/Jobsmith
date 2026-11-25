// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { InstallHint } from "@/components/prep/install-hint";
import { OFFLINE_COPY } from "@/lib/offline/copy";

function stubMatchMedia(standalone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: standalone && query.includes("standalone"), media: query, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("caches", {});
  stubMatchMedia(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InstallHint", () => {
  it("shows the install hint with the share sheet, the seven day Safari note and the locked screen note", () => {
    render(<InstallHint />);
    expect(screen.getByText(/share sheet or the browser menu/)).toBeTruthy();
    expect(screen.getByText(/seven days/)).toBeTruthy();
    expect(screen.getByText(/locked screen/)).toBeTruthy();
  });

  it("is hidden when the app runs standalone", () => {
    stubMatchMedia(true);
    const { container } = render(<InstallHint />);
    expect(container.firstChild).toBeNull();
  });

  it("is hidden when Cache Storage is unavailable", () => {
    vi.unstubAllGlobals();
    stubMatchMedia(false);
    const { container } = render(<InstallHint />);
    expect(container.firstChild).toBeNull();
  });

  it("is dismissible and stays dismissed on this device", async () => {
    const { container, unmount } = render(<InstallHint />);
    await act(async () => screen.getByRole("button", { name: "Dismiss" }).click());
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem("jobsmith-install-hint-dismissed")).toBe("1");
    unmount();
    const again = render(<InstallHint />);
    expect(again.container.firstChild).toBeNull();
  });

  it("the copy has no exclamation mark", () => {
    const all = JSON.stringify(OFFLINE_COPY);
    expect(all).not.toContain("!");
    expect(all).not.toContain("—");
  });
});
