// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { deleteAudioAction, prepareAudioAction } from "@/app/(app)/jobs/[slug]/audio-actions";
import { AudioPanel } from "@/components/prep/audio-panel";
import { FIT_POLL_MAX, FIT_POLL_MS } from "@/lib/fit/card";
import type { AudioStatus } from "@/lib/prep/audio-status";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/jobs/[slug]/audio-actions", () => ({
  prepareAudioAction: vi.fn(),
  deleteAudioAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const prepare = vi.mocked(prepareAudioAction);
const remove = vi.mocked(deleteAudioAction);
const JOB = "00000000-0000-4000-8000-000000000001";

function renderPanel(status: AudioStatus, ttsOn = true) {
  return render(
    <LiveAnnouncerProvider>
      <AudioPanel opportunityId={JOB} docKey="bank" status={status} ttsOn={ttsOn} />
    </LiveAnnouncerProvider>,
  );
}

const reply = (done: number, total: number, paused = false) => ({ ok: true as const, data: { done, total, paused } });

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  prepare.mockReset();
  remove.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AudioPanel", () => {
  it("shows the audio line, and Prepare audio only when TTS is configured and clips are missing", () => {
    renderPanel({ state: "partial", done: 61, total: 96 });
    expect(screen.getByText("Audio: 61 of 96 clips")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare audio" })).toBeTruthy();
    cleanup();
    renderPanel({ state: "ready" });
    expect(screen.getByText("Audio ready")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare audio" })).toBeNull();
  });

  it("calls the action again every 3 seconds while clips are missing and shows the live count", async () => {
    prepare.mockResolvedValueOnce(reply(20, 96)).mockResolvedValueOnce(reply(40, 96)).mockResolvedValue(reply(61, 96));
    renderPanel({ state: "partial", done: 0, total: 96 });
    fireEvent.click(screen.getByRole("button", { name: "Prepare audio" }));
    await flush();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(JOB, "bank");
    expect(screen.getByText("Audio: 20 of 96 clips")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIT_POLL_MS - 1);
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIT_POLL_MS);
    });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Audio: 61 of 96 clips")).toBeTruthy();
  });

  it("stops at done equal to total, refreshes and announces Audio ready once", async () => {
    prepare.mockResolvedValueOnce(reply(20, 40)).mockResolvedValueOnce(reply(40, 40));
    renderPanel({ state: "partial", done: 0, total: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Prepare audio" }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIT_POLL_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Audio ready.")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIT_POLL_MS * 5);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("on paused it shows the pause line and tries again after 60 seconds", async () => {
    prepare.mockResolvedValueOnce(reply(5, 40, true)).mockResolvedValue(reply(40, 40));
    renderPanel({ state: "partial", done: 0, total: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Prepare audio" }));
    await flush();
    expect(screen.getByText("Paused, trying again in a minute")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("stops after 40 calls", async () => {
    prepare.mockResolvedValue(reply(1, 96));
    renderPanel({ state: "partial", done: 0, total: 96 });
    fireEvent.click(screen.getByRole("button", { name: "Prepare audio" }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIT_POLL_MS * (FIT_POLL_MAX + 10));
    });
    expect(prepare).toHaveBeenCalledTimes(FIT_POLL_MAX);
  });

  it("with TTS off it shows the browser voice line and a link to Settings", () => {
    renderPanel({ state: "browser" }, false);
    expect(screen.getByText("Browser voice")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("button", { name: "Prepare audio" })).toBeNull();
  });

  it("Delete audio asks for confirmation before calling the action", async () => {
    remove.mockResolvedValue({ ok: true, data: { deleted: 3 } });
    renderPanel({ state: "ready" });
    fireEvent.click(screen.getByRole("button", { name: "Delete audio" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete clips" }));
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });
});
