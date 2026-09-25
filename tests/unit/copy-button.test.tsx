// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Toaster, toast } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { CopyButton } from "@/components/copy-button";

function renderButton(value: string, label: string) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <CopyButton value={value} label={label} />
    </LiveAnnouncerProvider>,
  );
}

describe("CopyButton", () => {
  it("shows the visible text Copy while taking its accessible name from label", () => {
    renderButton("jsm_abc", "Copy the token");
    const button = screen.getByRole("button", { name: "Copy the token" });
    expect(button.textContent).toBe("Copy");
  });

  it("writes the value to the clipboard and announces Copied. on success", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderButton("jsm_abc", "Copy the token");
    await act(async () => {
      screen.getByRole("button", { name: "Copy the token" }).click();
      await Promise.resolve();
      vi.advanceTimersByTime(50);
    });

    expect(writeText).toHaveBeenCalledWith("jsm_abc");
    expect(screen.getByRole("status").textContent).toBe("Copied.");
    vi.useRealTimers();
  });

  it("toasts the fixed failure sentence and never announces when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const toastErrorSpy = vi.spyOn(toast, "error");
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderButton("jsm_abc", "Copy the pull command");
    await act(async () => {
      screen.getByRole("button", { name: "Copy the pull command" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorSpy).toHaveBeenCalledWith("Could not copy. Select the text and copy it by hand.");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
