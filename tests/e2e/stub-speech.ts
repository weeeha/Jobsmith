import type { Page } from "@playwright/test";

export type StubWindow = {
  __spoken: { text: string; rate: number }[];
  __plays: { src: string; rate: number }[];
};

/**
 * Installs, before the page's own scripts run, a speechSynthesis that records
 * what it is asked to say (and finishes each line after 30 ms), and a wrapper
 * around HTMLMediaElement.play that records the clip and the playback rate.
 * Headless Chromium cannot be heard, so these records are what a spec asserts.
 */
export async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as StubWindow & Window;
    w.__spoken = [];
    w.__plays = [];
    const voices = [
      { name: "Stub Alex", voiceURI: "stub-alex", lang: "en-US" },
      { name: "Stub Sam", voiceURI: "stub-sam", lang: "en-GB" },
    ];
    const stub = {
      speak(utterance: SpeechSynthesisUtterance) {
        w.__spoken.push({ text: utterance.text, rate: utterance.rate });
        setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 30);
      },
      cancel() {},
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: stub, configurable: true });

    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__plays.push({ src: this.getAttribute("src") ?? this.src, rate: this.playbackRate });
      return play.call(this);
    };
  });
}

export async function spoken(page: Page): Promise<StubWindow["__spoken"]> {
  return page.evaluate(() => (window as unknown as StubWindow).__spoken);
}

export async function plays(page: Page): Promise<StubWindow["__plays"]> {
  return page.evaluate(() => (window as unknown as StubWindow).__plays);
}
