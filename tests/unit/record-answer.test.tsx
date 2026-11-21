// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { QuestionRecordings } from "@/components/prep/question-recordings";
import { RecordAnswer, type MediaEnv, type RecorderLike } from "@/components/player/record-answer";
import { deleteRecordingAction } from "@/app/(app)/jobs/[slug]/prep-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({ deleteRecordingAction: vi.fn() }));

const JOB = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const KEY = "00000000000000a1";

class StubRecorder implements RecorderLike {
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: RecorderLike["ondataavailable"] = null;
  onstop: RecorderLike["onstop"] = null;
  started = false;
  stopped = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function makeEnv(over: Partial<{ reject: boolean }> = {}) {
  const recorder = new StubRecorder();
  const trackStop = vi.fn();
  const getUserMedia = vi.fn(async () => {
    if (over.reject) throw new DOMException("denied", "NotAllowedError");
    return { getTracks: () => [{ stop: trackStop }] };
  });
  const env: MediaEnv = { getUserMedia, createRecorder: () => recorder };
  return { env, recorder, getUserMedia, trackStop };
}

const upload = vi.fn();
const onRefused = vi.fn();

function ui(env: MediaEnv, phase: "gap" | "reveal", over: Partial<React.ComponentProps<typeof RecordAnswer>> = {}) {
  return (
    <LiveAnnouncerProvider>
      <Toaster />
      <RecordAnswer
        phase={phase}
        opportunityId={JOB}
        sessionId={SESSION}
        questionKey={KEY}
        refused={false}
        onRefused={onRefused}
        env={env}
        upload={upload}
        {...over}
      />
    </LiveAnnouncerProvider>
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  cleanup();
  upload.mockReset();
  upload.mockResolvedValue({ ok: true });
  onRefused.mockReset();
  refresh.mockReset();
  vi.mocked(deleteRecordingAction).mockReset();
  URL.createObjectURL = vi.fn(() => "blob:recording");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("RecordAnswer", () => {
  it("the button 'Record my answer' starts recording on a click and stops at the reveal", async () => {
    const { env, recorder, getUserMedia, trackStop } = makeEnv();
    const { rerender } = render(ui(env, "gap"));
    expect(getUserMedia).not.toHaveBeenCalled();
    await click("Record my answer");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(recorder.started).toBe(true);
    expect(screen.queryByRole("button", { name: "Record my answer" })).toBeNull();
    expect(screen.getByText(/Recording\./)).toBeTruthy();
    expect(recorder.stopped).toBe(false);
    await act(async () => rerender(ui(env, "reveal")));
    expect(recorder.stopped).toBe(true);
    expect(trackStop).toHaveBeenCalled();
  });

  it("after the reveal it plays the recording next to the Say clip and offers Keep and Discard", async () => {
    const { env } = makeEnv();
    const { rerender } = render(ui(env, "gap"));
    await click("Record my answer");
    await act(async () => rerender(ui(env, "reveal")));
    const player = document.querySelector("audio");
    expect(player?.getAttribute("src")).toBe("blob:recording");
    expect(player?.hasAttribute("controls")).toBe(true);
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  it("nothing is uploaded until Keep is tapped; Discard drops the blob", async () => {
    const { env } = makeEnv();
    const first = render(ui(env, "gap"));
    await click("Record my answer");
    await act(async () => first.rerender(ui(env, "reveal")));
    expect(upload).not.toHaveBeenCalled();
    await click("Keep");
    expect(upload).toHaveBeenCalledTimes(1);
    const sent = upload.mock.calls[0][0];
    expect(sent).toMatchObject({ opportunityId: JOB, sessionId: SESSION, questionKey: KEY });
    expect(sent.blob.size).toBe(4);
    expect(screen.getByText("Recording saved.")).toBeTruthy();
    cleanup();

    upload.mockClear();
    const second = makeEnv();
    const view = render(ui(second.env, "gap"));
    await click("Record my answer");
    await act(async () => view.rerender(ui(second.env, "reveal")));
    await click("Discard");
    expect(upload).not.toHaveBeenCalled();
    expect(document.querySelector("audio")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recording");
  });

  it("a failed upload keeps the recording so Keep can be tried again", async () => {
    upload.mockResolvedValueOnce({ ok: false, message: "Could not save the recording." });
    const { env } = makeEnv();
    const { rerender } = render(ui(env, "gap"));
    await click("Record my answer");
    await act(async () => rerender(ui(env, "reveal")));
    await click("Keep");
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    await click("Keep");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Recording saved.")).toBeTruthy();
  });

  it("a refused microphone hides the button for the session with 'Recording is not available: the microphone was refused.'", async () => {
    const { env, recorder } = makeEnv({ reject: true });
    const { rerender } = render(ui(env, "gap"));
    await click("Record my answer");
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(recorder.started).toBe(false);
    // The parent holds the refusal for the rest of the session.
    await act(async () => rerender(ui(env, "gap", { refused: true })));
    expect(screen.queryByRole("button", { name: "Record my answer" })).toBeNull();
    expect(screen.getByText("Recording is not available: the microphone was refused.")).toBeTruthy();
  });

  it("hides the button when MediaRecorder is missing or there is no session", () => {
    const { env } = makeEnv();
    const { container, rerender } = render(ui({ ...env, createRecorder: null }, "gap"));
    expect(screen.queryByRole("button", { name: "Record my answer" })).toBeNull();
    rerender(ui({ ...env, getUserMedia: null }, "gap"));
    expect(screen.queryByRole("button", { name: "Record my answer" })).toBeNull();
    rerender(ui(env, "gap", { sessionId: null }));
    expect(screen.queryByRole("button", { name: "Record my answer" })).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("leaving the question while recording stops the recorder and the microphone and keeps nothing", async () => {
    const { env, recorder, trackStop } = makeEnv();
    const view = render(ui(env, "gap"));
    await click("Record my answer");
    view.unmount();
    expect(recorder.stopped).toBe(true);
    expect(trackStop).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("QuestionRecordings", () => {
  const recordings = [
    { assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-11-22T10:00:00.000Z" },
    { assetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", createdAt: "2026-11-21T10:00:00.000Z" },
  ];

  it("the hub lists recordings under their question with a Delete button", async () => {
    vi.mocked(deleteRecordingAction).mockResolvedValue({ ok: true, data: null });
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <QuestionRecordings recordings={recordings} />
      </LiveAnnouncerProvider>,
    );
    const players = document.querySelectorAll("audio");
    expect([...players].map((p) => p.getAttribute("src"))).toEqual([
      "/api/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "/api/assets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    const deletes = screen.getAllByRole("button", { name: /^Delete/ });
    expect(deletes).toHaveLength(2);
    await act(async () => {
      fireEvent.click(deletes[0]);
    });
    expect(deleteRecordingAction).toHaveBeenCalledWith(recordings[0].assetId);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(1);
  });

  it("renders nothing for a question with no recording", () => {
    const { container } = render(
      <LiveAnnouncerProvider>
        <QuestionRecordings recordings={[]} />
      </LiveAnnouncerProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("a failed delete keeps the recording and says so", async () => {
    vi.mocked(deleteRecordingAction).mockResolvedValue({ ok: false, code: "not_found", message: "This recording no longer exists." });
    render(
      <LiveAnnouncerProvider>
        <Toaster />
        <QuestionRecordings recordings={recordings} />
      </LiveAnnouncerProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^Delete/ })[0]);
    });
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(2);
  });
});
