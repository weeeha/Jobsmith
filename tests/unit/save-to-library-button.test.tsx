// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { SaveToLibraryButton } from "@/components/library/save-to-library-button";
import { QuestionList } from "@/components/prep/question-list";
import { ListenPlayer } from "@/components/player/listen-player";
import { DrillSummary } from "@/components/player/drill-summary";
import { saveToLibraryAction } from "@/app/(app)/library/actions";
import type { HubQuestion } from "@/lib/prep/hub";
import type { PlaybackPlan } from "@/lib/prep/plan";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/library/actions", () => ({ saveToLibraryAction: vi.fn(), createLibraryItemAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({
  markQuestionAction: vi.fn(),
  rebuildQuestionsAction: vi.fn(),
  endSessionAction: vi.fn().mockResolvedValue({ ok: true, data: { eventWritten: true } }),
}));
vi.mock("@/app/(app)/jobs/[slug]/audio-actions", () => ({ regenerateClipAction: vi.fn() }));
vi.mock("@/components/player/engine", () => ({
  usePlaybackEngine: () => ({
    state: { status: "idle", stepIndex: 0, speed: 1 },
    currentStep: null,
    currentQuestionIndex: 0,
    dispatch: vi.fn(),
  }),
}));
vi.mock("@/components/player/media-session", () => ({ useMediaSession: () => ({ backgroundStopped: false }) }));

const JOB = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const KEY = "0123456789abcdef";

beforeEach(() => {
  cleanup();
  vi.mocked(saveToLibraryAction).mockReset();
});
afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <LiveAnnouncerProvider>
      <Toaster />
      {node}
    </LiveAnnouncerProvider>,
  );
}

describe("SaveToLibraryButton", () => {
  it("the button shows 'Saved to library.' with an Open link and 'Already in your library.' on a repeat", async () => {
    vi.mocked(saveToLibraryAction).mockResolvedValueOnce({ ok: true, data: { id: ITEM, created: true } });
    vi.mocked(saveToLibraryAction).mockResolvedValueOnce({ ok: true, data: { id: ITEM, created: false } });
    wrap(<SaveToLibraryButton opportunityId={JOB} questionKey={KEY} questionLabel="Tell me about yourself" />);
    const button = screen.getByRole("button", { name: "Save to library: Tell me about yourself" });
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.getAllByText(/Saved to library\./).length).toBeGreaterThan(0));
    expect(saveToLibraryAction).toHaveBeenCalledWith({ opportunityId: JOB, questionKey: KEY });
    const open = await screen.findByRole("link", { name: "Open" });
    expect(open.getAttribute("href")).toBe(`/library/${ITEM}`);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save to library: Tell me about yourself" }));
    });
    await waitFor(() => expect(screen.getAllByText(/Already in your library\./).length).toBeGreaterThan(0));
  });

  it("shows the action's message on a failure and survives a thrown error", async () => {
    vi.mocked(saveToLibraryAction).mockResolvedValueOnce({ ok: false, code: "invalid", message: "This question has no answer to save." });
    vi.mocked(saveToLibraryAction).mockRejectedValueOnce(new Error("network"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    wrap(<SaveToLibraryButton opportunityId={JOB} questionKey={KEY} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save to library" }));
    });
    await waitFor(() => expect(screen.getAllByText("This question has no answer to save.").length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save to library" }));
    });
    await waitFor(() => expect(screen.getAllByText("Could not save to the library. Try again.").length).toBeGreaterThan(0));
    spy.mockRestore();
  });
});

describe("where the button appears", () => {
  it("the button appears in the hub's question list, in Listen and in the Drill summary", () => {
    const question: HubQuestion = {
      id: "id-1",
      artifactKey: "bank",
      number: 1,
      section: null,
      position: 0,
      question: "Tell me about yourself",
      questionKey: KEY,
      unfilled: false,
      hasAnswer: true,
      level: null,
      recordings: [],
    };
    const view = wrap(<QuestionList opportunityId={JOB} basePath="/jobs/northwind" questions={[question, { ...question, id: "id-2", number: 2, questionKey: "ffffffffffffffff", question: "Unwritten", hasAnswer: false, unfilled: true }]} />);
    expect(screen.getAllByRole("button", { name: /^Save to library/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save to library: Tell me about yourself" })).toBeTruthy();
    view.unmount();

    const plan: PlaybackPlan = {
      title: "Question bank",
      subtitle: "Designer at Northwind Traders",
      questions: [{ number: 1, section: null, questionKey: KEY, question: "Tell me about yourself", level: null, blocks: [{ index: 1, label: "Say:", spoken: true, text: "Answer" }] }],
      steps: [{ id: "0-0", questionIndex: 0, blockIndex: null, kind: "question", speaker: "interviewer", text: "Tell me about yourself", hash: KEY, clip: null, gapAfterMs: 600 }],
    };
    const listen = wrap(
      <ListenPlayer plan={plan} kind="bank" opportunityId={JOB} speed={1} gapFactor={1} browserVoices={{ interviewer: null, candidate: null }} initialStepIndex={0} backHref="/jobs/northwind?tab=prep" />,
    );
    expect(screen.getByRole("button", { name: "Save to library: Tell me about yourself" })).toBeTruthy();
    listen.unmount();

    wrap(
      <DrillSummary
        summary={{ marks: [{ questionKey: KEY, question: "Tell me about yourself", level: "solid" }], skipped: 0, stillShaky: [], solid: 1 }}
        slug="northwind"
        docRef="job:bank"
        sessionId={null}
        seen={1}
        opportunityId={JOB}
      />,
    );
    const marks = screen.getByRole("list", { name: "Marks given" });
    expect(within(marks).getByRole("button", { name: "Save to library: Tell me about yourself" })).toBeTruthy();
  });
});
