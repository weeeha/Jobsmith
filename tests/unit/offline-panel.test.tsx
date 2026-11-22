// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { OfflinePanel } from "@/components/prep/offline-panel";
import { deleteSaved, readSavedMeta, saveForOffline } from "@/lib/offline/save";
import type { PrepManifest } from "@/lib/prep/manifest";

vi.mock("@/lib/offline/save", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/save")>()),
  saveForOffline: vi.fn(),
  readSavedMeta: vi.fn(),
  deleteSaved: vi.fn(),
}));

const save = vi.mocked(saveForOffline);
const readMeta = vi.mocked(readSavedMeta);
const remove = vi.mocked(deleteSaved);

const MB = 1024 * 1024;
const manifest = { slug: "acme-designer", banks: [], pitches: [], assets: Array.from({ length: 96 }, (_, i) => ({ id: `a${i}`, bytes: 0 })), totalBytes: 38 * MB } as unknown as PrepManifest;
const fakeCaches = {} as CacheStorage;
const okFetch = (async () => ({ ok: true, redirected: false, json: async () => manifest })) as unknown as typeof fetch;

function renderPanel(fetchImpl: typeof fetch = okFetch, caches: CacheStorage | null = fakeCaches) {
  return render(
    <LiveAnnouncerProvider>
      <OfflinePanel slug="acme-designer" userHash="aaaa" deps={{ fetch: fetchImpl, caches: caches ?? undefined }} />
    </LiveAnnouncerProvider>,
  );
}

const click = (name: string) => act(async () => screen.getByRole("button", { name }).click());

beforeEach(() => {
  save.mockReset();
  readMeta.mockReset().mockResolvedValue(null);
  remove.mockReset().mockResolvedValue();
});
afterEach(cleanup);

describe("OfflinePanel", () => {
  it("shows 'Save for offline' with the size '38 MB, 96 clips' before anything is saved", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: "Save for offline" })).toBeTruthy();
    expect(screen.getByText("38 MB, 96 clips")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("clicking it saves and shows progress, then 'Saved' with the date", async () => {
    let finish!: (v: Awaited<ReturnType<typeof saveForOffline>>) => void;
    save.mockImplementation(async (input) => {
      input.onProgress({ done: 40, total: 96 });
      return new Promise((resolve) => (finish = resolve));
    });
    renderPanel();
    await screen.findByRole("button", { name: "Save for offline" });
    await click("Save for offline");
    expect(screen.getByText("Saving 40 of 96")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save for offline" })).toBeNull();
    await act(async () => finish({ ok: true, failed: [], savedAt: new Date("2026-11-21T12:00:00Z") }));
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-21T12:00:00.000Z");
    expect(screen.getByRole("button", { name: "Remove saved copy" })).toBeTruthy();
  });

  it("a failed save shows the failed count and 'Try again', and a retry resumes", async () => {
    save.mockResolvedValueOnce({ ok: false, failed: ["/a", "/b", "/c"], savedAt: new Date() });
    renderPanel();
    await screen.findByRole("button", { name: "Save for offline" });
    await click("Save for offline");
    expect(screen.getByText("3 items could not be saved")).toBeTruthy();
    save.mockResolvedValueOnce({ ok: true, failed: [], savedAt: new Date("2026-11-21T12:00:00Z") });
    await click("Try again");
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.queryByText(/could not be saved/)).toBeNull();
  });

  it("'Remove saved copy' deletes the job's cache and returns to 'Save for offline'", async () => {
    readMeta.mockResolvedValue({ savedAt: new Date("2026-11-20T09:00:00Z"), clips: 96, bytes: 38 * MB });
    remove.mockImplementation(async () => {
      readMeta.mockResolvedValue(null);
    });
    renderPanel();
    expect(await screen.findByText("Saved")).toBeTruthy();
    await click("Remove saved copy");
    expect(remove).toHaveBeenCalledWith(fakeCaches, "aaaa", "acme-designer");
    expect(await screen.findByRole("button", { name: "Save for offline" })).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("announces 'Saved for offline.' through the live region", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      save.mockResolvedValue({ ok: true, failed: [], savedAt: new Date() });
      renderPanel();
      await screen.findByRole("button", { name: "Save for offline" });
      await click("Save for offline");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const live = [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent);
      expect(live).toContain("Saved for offline.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is hidden when Cache Storage is unavailable", async () => {
    const { container } = renderPanel(okFetch, null);
    await act(async () => {});
    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says so, with 'Try again', when the job's size cannot be read", async () => {
    const failing = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    renderPanel(failing);
    expect(await screen.findByText("Could not read what this job needs to save.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
  });
});
