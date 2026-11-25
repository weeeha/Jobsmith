// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { VoiceSection } from "@/components/settings/voice-section";
import { deleteAllAudioAction, loadVoicesAction, savePrepSettingsAction } from "@/app/(app)/settings/actions";
import { DEFAULT_PREP_SETTINGS, type PrepSettings } from "@/lib/prep/settings";

vi.mock("@/app/(app)/settings/actions", () => ({
  savePrepSettingsAction: vi.fn(),
  deleteAllAudioAction: vi.fn(),
  loadVoicesAction: vi.fn(),
}));

const load = vi.mocked(loadVoicesAction);
const remove = vi.mocked(deleteAllAudioAction);
const save = vi.mocked(savePrepSettingsAction);

const VOICES = [
  { id: "Vivian", label: "Vivian", language: "en" },
  { id: "Ryan", label: "Ryan", language: "en" },
  { id: "Aria", label: "Aria", language: "en" },
];

function renderSection(over: { provider?: string | null; settings?: PrepSettings; storage?: { clips: number; bytes: number } } = {}) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <VoiceSection
        provider={over.provider === undefined ? "openai_compatible" : over.provider}
        settings={over.settings ?? DEFAULT_PREP_SETTINGS}
        storage={over.storage ?? { clips: 12, bytes: 3_600_000 }}
      />
    </LiveAnnouncerProvider>,
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function stubSpeech(voices: { name: string; voiceURI: string; lang: string }[]) {
  const listeners = new Set<() => void>();
  const synth = {
    getVoices: () => voices,
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  return {
    set(next: typeof voices) {
      voices.splice(0, voices.length, ...next);
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  load.mockReset().mockResolvedValue({ ok: true, data: VOICES });
  remove.mockReset();
  save.mockReset();
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});
afterEach(cleanup);

describe("VoiceSection", () => {
  it("with TTS off it shows 'Off: the player uses your browser's voices' and no provider pickers", async () => {
    renderSection({ provider: null });
    await settle();
    expect(screen.getByText("Off: the player uses your browser's voices")).toBeTruthy();
    expect(screen.queryByLabelText("Interviewer voice")).toBeNull();
    expect(screen.queryByLabelText("My voice")).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("with TTS on it lists the provider's voices and pre-selects Vivian and Ryan when none are saved", async () => {
    renderSection();
    expect(screen.getByText("OpenAI-compatible server")).toBeTruthy();
    await settle();
    const interviewer = screen.getByLabelText("Interviewer voice") as HTMLSelectElement;
    const mine = screen.getByLabelText("My voice") as HTMLSelectElement;
    expect([...interviewer.options].map((o) => o.value)).toEqual(["Vivian", "Ryan", "Aria"]);
    expect(interviewer.value).toBe("Vivian");
    expect(mine.value).toBe("Ryan");
  });

  it("pre-selects the saved voices", async () => {
    renderSection({ settings: { ...DEFAULT_PREP_SETTINGS, voices: { interviewer: "Aria", candidate: "Vivian" } } });
    await settle();
    expect((screen.getByLabelText("Interviewer voice") as HTMLSelectElement).value).toBe("Aria");
    expect((screen.getByLabelText("My voice") as HTMLSelectElement).value).toBe("Vivian");
  });

  it("with an empty provider list it shows a text field for each voice and says why", async () => {
    load.mockResolvedValue({ ok: true, data: [] });
    renderSection();
    await settle();
    const interviewer = screen.getByLabelText("Interviewer voice") as HTMLInputElement;
    expect(interviewer.tagName).toBe("INPUT");
    expect(interviewer.value).toBe("Vivian");
    expect((screen.getByLabelText("My voice") as HTMLInputElement).value).toBe("Ryan");
    expect(screen.getByText(/did not return a voice list/)).toBeTruthy();
  });

  it("a failed load shows a clear message, keeps the text fields and offers to try again", async () => {
    load.mockRejectedValueOnce(new Error("network"));
    renderSection();
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Could not load the voice list");
    expect((screen.getByLabelText("Interviewer voice") as HTMLInputElement).tagName).toBe("INPUT");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Load voices again" })));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Interviewer voice") as HTMLSelectElement).tagName).toBe("SELECT");
  });

  it("browser voice pickers fill from speechSynthesis.getVoices and refill on voiceschanged", async () => {
    const speech = stubSpeech([{ name: "Daniel", voiceURI: "dan-uri", lang: "en-GB" }]);
    renderSection({ provider: null });
    await settle();
    const picker = () => screen.getByLabelText("Interviewer voice on this device") as HTMLSelectElement;
    expect([...picker().options].map((o) => o.value)).toEqual(["", "dan-uri"]);
    act(() => speech.set([{ name: "Daniel", voiceURI: "dan-uri", lang: "en-GB" }, { name: "Samantha", voiceURI: "sam-uri", lang: "en-US" }]));
    expect([...picker().options].map((o) => o.value)).toEqual(["", "dan-uri", "sam-uri"]);
  });

  it("without speechSynthesis it says the browser has no voices and still renders", async () => {
    renderSection({ provider: null });
    await settle();
    expect(screen.getByText(/has no speech voices/)).toBeTruthy();
  });

  it("shows the defaults for speed (1) and gap factor (1)", async () => {
    renderSection({ provider: null });
    await settle();
    expect((screen.getByLabelText("Speed") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Pause factor") as HTMLInputElement).value).toBe("1");
    expect(screen.getAllByText("Default 1")).toHaveLength(2);
  });

  it("shows the storage line and the keep-your-clips sentence", async () => {
    renderSection({ provider: null });
    await settle();
    expect(screen.getByText("12 clips, 3.4 MB")).toBeTruthy();
    expect(screen.getByText(/Changing a voice keeps your existing clips/)).toBeTruthy();
  });

  it("Delete all audio asks for confirmation before calling the action", async () => {
    remove.mockResolvedValue({ ok: true, data: { deleted: 12 } });
    renderSection({ provider: null });
    await settle();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Delete all audio" })));
    expect(remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await act(async () => void fireEvent.click(within(dialog).getByRole("button", { name: "Delete all clips" })));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("Keep clips closes the dialog without calling the action", async () => {
    renderSection({ provider: null });
    await settle();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Delete all audio" })));
    await act(async () => void fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep clips" })));
    expect(remove).not.toHaveBeenCalled();
  });

  it("with no clips Delete all audio is disabled", async () => {
    renderSection({ provider: null, storage: { clips: 0, bytes: 0 } });
    await settle();
    expect((screen.getByRole("button", { name: "Delete all audio" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saving sends the form values and shows field errors from the server", async () => {
    save.mockResolvedValue({ ok: false, code: "invalid", message: "Check the highlighted fields.", fieldErrors: { speed: "Enter a speed from 0.8 to 1.5." } });
    renderSection({ provider: null });
    await settle();
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "3" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save voice settings" })));
    await settle();
    const sent = save.mock.calls[0][1] as FormData;
    expect(sent.get("speed")).toBe("3");
    expect(screen.getByText("Enter a speed from 0.8 to 1.5.")).toBeTruthy();
  });

  it("keeps saved provider voices in hidden fields when TTS is off, so saving does not erase them", async () => {
    save.mockResolvedValue({ ok: true });
    renderSection({ provider: null, settings: { ...DEFAULT_PREP_SETTINGS, voices: { interviewer: "Aria", candidate: "Ryan" } } });
    await settle();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save voice settings" })));
    const sent = save.mock.calls[0][1] as FormData;
    expect(sent.get("interviewerVoice")).toBe("Aria");
    expect(sent.get("candidateVoice")).toBe("Ryan");
  });
});
