// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { DrillPlayer } from "@/components/player/drill-player";
import { endSessionAction, markQuestionAction, startSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import type { DrillQuestion } from "@/lib/prep/drill";
import type { PlaybackStep } from "@/lib/prep/plan";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/library/actions", () => ({ saveToLibraryAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({
  markQuestionAction: vi.fn(),
  startSessionAction: vi.fn(),
  endSessionAction: vi.fn(),
}));

// The speaker is a stub that holds each speech open until the test finishes it.
type Pending = { step: PlaybackStep; resolve: (outcome: "ended" | "cancelled") => void };
const speech: { pending: Pending[]; spoken: PlaybackStep[]; cancel: ReturnType<typeof vi.fn<() => void>> } = {
  pending: [],
  spoken: [],
  cancel: vi.fn<() => void>(),
};
vi.mock("@/components/player/speaker", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/player/speaker")>();
  const stub = {
    speak: (step: PlaybackStep) =>
      new Promise((resolve) => {
        speech.spoken.push(step);
        speech.pending.push({ step, resolve });
      }),
    // The real speaker settles a cancelled speech as "cancelled".
    cancel: () => {
      speech.cancel();
      for (const p of speech.pending.splice(0)) p.resolve("cancelled");
    },
  };
  return { ...original, useSpeaker: () => stub };
});

const JOB = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

function step(questionIndex: number, kind: "question" | "text", text: string, clip: PlaybackStep["clip"] = null): PlaybackStep {
  return {
    id: `${questionIndex}-${kind}`,
    questionIndex,
    blockIndex: kind === "question" ? null : 1,
    kind,
    speaker: kind === "question" ? "interviewer" : "candidate",
    text,
    hash: "0123456789abcdef",
    clip,
    gapAfterMs: 0,
  };
}

function qs(n: number, over: Partial<DrillQuestion> = {}): DrillQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    questionKey: (i + 1).toString(16).padStart(16, "0"),
    number: i + 1,
    section: null,
    question: `Question text ${i + 1}`,
    ask: step(i, "question", `Question text ${i + 1}`),
    say: [step(i, "text", `Answer text ${i + 1}`)],
    spine: `Spine words ${i + 1}`,
    lastLine: `Last line words ${i + 1}`,
    guard: `Guard words ${i + 1}`,
    sayText: `Answer text ${i + 1}`,
    gapSeconds: 15,
    level: null,
    ...over,
  }));
}

const META = { order: [], docKey: "bank", section: null, onlyShaky: false };

function renderPlayer(questions: DrillQuestion[]) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      <DrillPlayer
        questions={questions}
        sessionMeta={{ ...META, order: questions.map((q) => q.questionKey) }}
        opportunityId={JOB}
        slug="northwind"
        docRef="job:bank"
        speed={1}
        browserVoices={{ interviewer: null, candidate: null }}
      />
    </LiveAnnouncerProvider>,
  );
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function tick(seconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
}
async function finishSpeech() {
  const next = speech.pending.shift();
  if (!next) throw new Error("nothing is being spoken");
  await act(async () => {
    next.resolve("ended");
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start drill" }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
// Start, let the interviewer finish, end the gap: the reveal.
async function toReveal() {
  await start();
  await finishSpeech();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(window, { key });
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
  speech.pending = [];
  speech.spoken = [];
  speech.cancel.mockReset();
  vi.mocked(markQuestionAction).mockReset();
  vi.mocked(startSessionAction).mockReset();
  vi.mocked(endSessionAction).mockReset();
  vi.mocked(markQuestionAction).mockImplementation(async (input) => ({
    ok: true,
    data: { level: input.level, markedAt: input.markedAt, drillCount: 1, applied: true },
  }));
  vi.mocked(startSessionAction).mockResolvedValue({ ok: true, data: { id: SESSION } });
  vi.mocked(endSessionAction).mockResolvedValue({ ok: true, data: { eventWritten: true } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DrillPlayer", () => {
  it("hides the question until the interviewer has asked, then shows it", async () => {
    renderPlayer(qs(2));
    expect(screen.queryByText("Question text 1")).toBeNull();
    await start();
    expect(speech.spoken[0].text).toBe("Question text 1");
    expect(speech.spoken[0].speaker).toBe("interviewer");
    expect(screen.queryByText("Question text 1")).toBeNull();
    await finishSpeech();
    expect(screen.getByText("Question text 1")).toBeTruthy();
  });

  it("makes no sound until Start is pressed", async () => {
    renderPlayer(qs(2));
    await flush();
    expect(speech.spoken).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Start drill" })).toBeTruthy();
  });

  it("the gap shows a countdown with role timer that ticks each second and moves to the reveal at zero", async () => {
    renderPlayer(qs(2));
    await start();
    await finishSpeech();
    expect(screen.getByRole("timer").textContent).toBe("0:15");
    await tick(1);
    expect(screen.getByRole("timer").textContent).toBe("0:14");
    await tick(13);
    expect(screen.getByRole("timer").textContent).toBe("0:01");
    expect(screen.queryByText("Spine words 1")).toBeNull();
    await tick(1);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Spine words 1")).toBeTruthy();
  });

  it("Done ends the gap early and More time adds 30 seconds", async () => {
    renderPlayer(qs(2));
    await start();
    await finishSpeech();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "More time" }));
    });
    expect(screen.getByRole("timer").textContent).toBe("0:45");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Spine words 1")).toBeTruthy();
  });

  it("the reveal shows the Spine first and the Say transcript with Last line and Guard as notes, and plays the Say block", async () => {
    renderPlayer(qs(2));
    await toReveal();
    const spine = screen.getByText("Spine words 1");
    const say = screen.getByText("Answer text 1");
    expect(spine.compareDocumentPosition(say) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Last line words 1")).toBeTruthy();
    expect(screen.getByText("Guard words 1")).toBeTruthy();
    expect(speech.spoken.at(-1)).toMatchObject({ speaker: "candidate", text: "Answer text 1" });
  });

  it("tapping Solid calls markQuestionAction with drilled true and moves to the next question", async () => {
    renderPlayer(qs(2));
    await toReveal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Solid" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(markQuestionAction).toHaveBeenCalledTimes(1);
    expect(markQuestionAction).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: JOB, scope: "job", questionKey: qs(2)[0].questionKey, level: "solid", drilled: true }),
    );
    expect(screen.getByText(/Question 2 of 2/)).toBeTruthy();
    expect(speech.spoken.at(-1)?.text).toBe("Question text 2");
  });

  it("keys 1, 2 and 3 mark Shaky, Okay and Solid in the reveal and do nothing before it", async () => {
    renderPlayer(qs(4));
    await start();
    await press("1");
    expect(markQuestionAction).not.toHaveBeenCalled();
    await finishSpeech();
    await press("2");
    expect(markQuestionAction).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    await press("1");
    expect(markQuestionAction).toHaveBeenLastCalledWith(expect.objectContaining({ level: "shaky" }));
    await finishSpeech(); // the next question's ask
    await press(" "); // ends the gap
    await press("2");
    expect(markQuestionAction).toHaveBeenLastCalledWith(expect.objectContaining({ level: "okay" }));
    await finishSpeech();
    await press(" ");
    await press("3");
    expect(markQuestionAction).toHaveBeenLastCalledWith(expect.objectContaining({ level: "solid" }));
    expect(markQuestionAction).toHaveBeenCalledTimes(3);
  });

  it("Skip advances with no call to markQuestionAction, and so does the right arrow", async () => {
    renderPlayer(qs(3));
    await toReveal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(markQuestionAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Question 2 of 3/)).toBeTruthy();
    await finishSpeech(); // the interviewer asks question 2
    await press(" "); // ends the gap
    await press("ArrowRight");
    expect(markQuestionAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Question 3 of 3/)).toBeTruthy();
  });

  it("space ends the gap, and in the reveal replays the Say block", async () => {
    renderPlayer(qs(2));
    await start();
    await finishSpeech();
    await press(" ");
    expect(screen.getByText("Spine words 1")).toBeTruthy();
    const before = speech.spoken.filter((s) => s.text === "Answer text 1").length;
    expect(before).toBe(1);
    await press(" ");
    expect(speech.spoken.filter((s) => s.text === "Answer text 1").length).toBe(2);
  });

  it("startSessionAction is called once on mount with mode drill and the fixed order", async () => {
    renderPlayer(qs(3));
    await flush();
    expect(startSessionAction).toHaveBeenCalledTimes(1);
    expect(startSessionAction).toHaveBeenCalledWith({
      opportunityId: JOB,
      mode: "drill",
      questions: 3,
      meta: { ...META, order: qs(3).map((q) => q.questionKey) },
    });
  });

  it("the summary lists the marks given and the questions still shaky and links 'Drill the shaky ones again' to ?only=shaky", async () => {
    renderPlayer(qs(2));
    await toReveal();
    await press("1");
    await finishSpeech();
    await press(" ");
    await press("3");
    const marks = screen.getByRole("list", { name: "Marks given" });
    expect(marks.textContent).toContain("Question text 1");
    expect(marks.textContent).toContain("Question text 2");
    expect(screen.getByRole("list", { name: "Still shaky" }).textContent).toContain("Question text 1");
    expect(screen.getByRole("link", { name: "Drill the shaky ones again" }).getAttribute("href")).toBe(
      "/jobs/northwind/drill?doc=job:bank&only=shaky",
    );
  });

  it("endSessionAction is called once, with seen, marked and solid counts", async () => {
    renderPlayer(qs(2));
    await toReveal();
    await press("3");
    await finishSpeech();
    await press(" ");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(endSessionAction).toHaveBeenCalledTimes(1);
    expect(endSessionAction).toHaveBeenCalledWith({ id: SESSION, seen: 2, marked: 1, solid: 1 });
  });

  it("announces marks through the live region", async () => {
    renderPlayer(qs(2));
    await toReveal();
    await press("2");
    await tick(1);
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Marked okay.")).toBe(true);
  });

  it("a question with no clip still plays through the browser voice", async () => {
    renderPlayer(qs(1));
    await toReveal();
    // The stub speaker stands for useSpeaker, which falls back to the browser voice for a null clip.
    expect(speech.spoken.at(-1)?.clip).toBeNull();
    expect(speech.spoken.at(-1)?.text).toBe("Answer text 1");
    expect(screen.getByText("Browser voice")).toBeTruthy();
  });

  it("a drill whose session could not start still runs and ends nothing", async () => {
    vi.mocked(startSessionAction).mockResolvedValue({ ok: false, code: "unexpected", message: "Offline" });
    renderPlayer(qs(1));
    await toReveal();
    await press("3");
    await flush();
    expect(screen.getByRole("list", { name: "Marks given" })).toBeTruthy();
    expect(endSessionAction).not.toHaveBeenCalled();
  });

  it("an empty drill shows the empty state instead of the player", async () => {
    renderPlayer([]);
    await flush();
    expect(screen.getByText(/Nothing to drill yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start drill" })).toBeNull();
    expect(startSessionAction).not.toHaveBeenCalled();
  });
});

describe("DrillPlayer in the library scope", () => {
  type Ensure = NonNullable<React.ComponentProps<typeof DrillPlayer>["ensureAudio"]>;

  function renderLibrary(questions: DrillQuestion[], ensureAudio?: Ensure) {
    return render(
      <LiveAnnouncerProvider>
        <Toaster />
        <DrillPlayer
          scope="library"
          questions={questions}
          sessionMeta={{ ...META, docKey: null, order: questions.map((q) => q.questionKey) }}
          opportunityId={null}
          slug={null}
          docRef={null}
          speed={1}
          browserVoices={{ interviewer: null, candidate: null }}
          ensureAudio={ensureAudio}
        />
      </LiveAnnouncerProvider>,
    );
  }

  it("starts a session with no job, marks through the library scope and ends without a job link", async () => {
    renderLibrary(qs(1));
    await toReveal();
    expect(startSessionAction).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: null, mode: "drill" }));
    await press("1");
    expect(markQuestionAction).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: null, scope: "library", level: "shaky", drilled: true }),
    );
    expect(screen.getByRole("link", { name: "Drill the shaky ones again" }).getAttribute("href")).toBe("/library/drill?only=shaky");
    expect(screen.getByRole("link", { name: "Back to Library" }).getAttribute("href")).toBe("/library");
    expect(screen.queryByRole("button", { name: "Save to library" })).toBeNull();
    expect(endSessionAction).toHaveBeenCalledWith({ id: SESSION, seen: 1, marked: 1, solid: 0 });
  });

  it("the in-drill back link goes to the Library", async () => {
    renderLibrary(qs(1));
    await flush();
    expect(screen.getByRole("link", { name: "Back to Library" }).getAttribute("href")).toBe("/library");
  });

  it("asks ensureAudio for the first two questions on mount and the next two as the drill moves on", async () => {
    const ensure = vi.fn<Ensure>(async () => ({ ok: true, data: { clips: {} } }));
    const questions = qs(5);
    renderLibrary(questions, ensure);
    await flush();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenLastCalledWith([questions[0].questionKey, questions[1].questionKey]);
    await toReveal();
    await press("3");
    await flush();
    expect(ensure).toHaveBeenLastCalledWith([questions[2].questionKey, questions[3].questionKey]);
    expect(ensure.mock.calls.flat(2)).not.toContain(questions[4].questionKey);
  });

  it("makes no sound for the ensureAudio call itself, and speaks through the browser voice until a clip arrives", async () => {
    let release: (value: Awaited<ReturnType<Ensure>>) => void = () => {};
    const ensure = vi.fn<Ensure>(() => new Promise((resolve) => (release = resolve)));
    const questions = qs(2);
    renderLibrary(questions, ensure);
    await flush();
    expect(speech.spoken).toHaveLength(0);
    await start();
    expect(speech.spoken[0].clip).toBeNull();
    await finishSpeech();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(speech.spoken.at(-1)).toMatchObject({ text: "Answer text 1", clip: null });
    // The clips for question 2 arrive while question 1 is on screen.
    await act(async () => {
      release({
        ok: true,
        data: { clips: { [questions[1].questionKey]: { askAssetId: "ask-asset", sayAssetId: "say-asset" } } },
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    await press("3");
    expect(speech.spoken.at(-1)).toMatchObject({ text: "Question text 2", clip: { assetId: "ask-asset" } });
    await finishSpeech();
    await press(" ");
    expect(speech.spoken.at(-1)).toMatchObject({ text: "Answer text 2", clip: { assetId: "say-asset" } });
  });

  it("a failed ensureAudio call leaves the drill on the browser voice", async () => {
    const ensure = vi.fn<Ensure>(async () => ({ ok: false, code: "tts_error", message: "no" }));
    renderLibrary(qs(1), ensure);
    await toReveal();
    expect(speech.spoken.at(-1)?.clip).toBeNull();
    expect(screen.getByText("Browser voice")).toBeTruthy();
  });
});
