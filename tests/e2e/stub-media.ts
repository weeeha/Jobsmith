import type { Page } from "@playwright/test";

/**
 * Installs, before the page's own scripts run, a getUserMedia that hands back
 * a stream with one stoppable track (or refuses), and a MediaRecorder that
 * produces a small webm blob when stopped. Headless browsers have no
 * microphone, so this is what stands in for one. The live microphone check is
 * a manual step.
 */
export async function stubMedia(page: Page, options: { refuse?: boolean } = {}): Promise<void> {
  await page.addInitScript((refuse) => {
    class FakeRecorder {
      mimeType = "audio/webm;codecs=opus";
      state = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        const data = new Blob([new Uint8Array(2048).fill(7)], { type: this.mimeType });
        setTimeout(() => {
          this.ondataavailable?.({ data });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
    const devices = {
      getUserMedia: async () => {
        if (refuse) throw new DOMException("Permission denied", "NotAllowedError");
        return { getTracks: () => [{ stop() {} }] };
      },
    };
    Object.defineProperty(navigator, "mediaDevices", { value: devices, configurable: true });
  }, options.refuse ?? false);
}
