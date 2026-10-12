// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/(app)/preferences/actions", () => ({ testPostingAction: vi.fn() }));

import { testPostingAction, type TestPostingState } from "@/app/(app)/preferences/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TestPostingBox } from "@/components/preferences/test-posting";
import type { TestPostingResult } from "@/lib/fit/test-posting";

const mockedAction = vi.mocked(testPostingAction);

const RESULT: TestPostingResult = {
  roleTitle: "Product Designer",
  companyName: "Northwind Traders",
  hardFilters: { pass: true, failed: [], unchecked: [] },
  fit: {
    score: 81,
    summary: "A strong match for internal tools work.",
    pros: ["Eight years in design systems."],
    cons: ["The posting does not state pay."],
  },
  note: null,
};

function renderBox(props: Partial<{ hasHardFilters: boolean; threshold: number }> = {}) {
  return render(
    <LiveAnnouncerProvider>
      <TestPostingBox hasHardFilters={props.hasHardFilters ?? true} threshold={props.threshold ?? 70} />
    </LiveAnnouncerProvider>,
  );
}

async function submitWith(state: TestPostingState, fields: { link?: string; text?: string } = { text: "A posting" }) {
  mockedAction.mockResolvedValueOnce(state);
  if (fields.link !== undefined) fireEvent.change(screen.getByLabelText("Link to the posting"), { target: { value: fields.link } });
  if (fields.text !== undefined) fireEvent.change(screen.getByLabelText("Posting text"), { target: { value: fields.text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    // One macrotask lets the mocked action settle and React apply the state.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function result(overrides: Partial<TestPostingResult> = {}): TestPostingState {
  return { ok: true, data: { ...RESULT, ...overrides } };
}

// The box's own status line; the live announcer is a second status element.
const pendingLine = () => document.querySelector('p[role="status"]');
const resultRegion = () => screen.getByRole("region", { name: "Result" });

beforeEach(() => {
  mockedAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("TestPostingBox result with long unbroken text", () => {
  it("lets the title, the summary and the lists break inside a word", async () => {
    renderBox();
    const word = "w".repeat(80);
    await submitWith(
      result({
        roleTitle: "r".repeat(80),
        companyName: "c".repeat(80),
        fit: { score: 81, summary: word, pros: [word], cons: [word] },
      }),
    );
    const title = within(resultRegion()).getByText(`${"r".repeat(80)} at ${"c".repeat(80)}`);
    expect(title.className).toContain("break-words");
    const elements = within(resultRegion()).getAllByText(word);
    expect(elements).toHaveLength(3);
    for (const element of elements) expect(element.className).toContain("break-words");
  });
});

describe("TestPostingBox", () => {
  it("has its heading, intro, two fields and a Test button, and nothing else until it runs", () => {
    renderBox();
    const section = screen.getByRole("region", { name: "Test against a posting" });
    expect(within(section).getByRole("heading", { level: 2, name: "Test against a posting" })).not.toBeNull();
    expect(
      within(section).getByText(
        "Paste a link or the posting text to see how a job would score against your saved preferences. Nothing is saved.",
      ),
    ).not.toBeNull();
    expect(within(section).getByLabelText("Link to the posting")).not.toBeNull();
    expect(within(section).getByLabelText("Posting text")).not.toBeNull();
    expect(within(section).getByRole("button", { name: "Test" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).toBeNull();
  });

  it("posts the link and the text the fields hold", async () => {
    renderBox();
    await submitWith(result(), { link: "https://example.com/jobs/1", text: "Pasted text" });
    expect(mockedAction).toHaveBeenCalledTimes(1);
    const sent = mockedAction.mock.calls[0]![1];
    expect(sent.get("sourceUrl")).toBe("https://example.com/jobs/1");
    expect(sent.get("postingText")).toBe("Pasted text");
  });

  it("keeps what was typed after a result", async () => {
    renderBox();
    await submitWith(result(), { text: "Pasted text" });
    expect((screen.getByLabelText("Posting text") as HTMLTextAreaElement).value).toBe("Pasted text");
  });

  it("says it is working while the request runs, and disables Test", async () => {
    renderBox();
    let finish: (state: TestPostingState) => void = () => {};
    mockedAction.mockReturnValueOnce(new Promise<TestPostingState>((resolve) => (finish = resolve)));
    fireEvent.change(screen.getByLabelText("Posting text"), { target: { value: "A posting" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test" }));
      await Promise.resolve();
    });
    expect(pendingLine()?.textContent).toBe(
      "Reading and scoring the posting. This can take up to half a minute.",
    );
    expect((screen.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      finish(result());
      await Promise.resolve();
    });
    expect(pendingLine()?.textContent).toBe("");
  });

  it("shows the score, the summary, both lists and the good-fit line", async () => {
    renderBox({ threshold: 90 });
    await submitWith(result());
    const region = resultRegion();
    expect(within(region).getByRole("heading", { level: 3, name: "Result" })).not.toBeNull();
    expect(within(region).getByText("Product Designer at Northwind Traders")).not.toBeNull();
    expect(region.querySelector('[data-slot="badge"]')?.textContent).toBe("Fit score 81, strong fit");
    expect(within(region).getByText("Below your good-fit line of 90.")).not.toBeNull();
    expect(within(region).getByText("A strong match for internal tools work.")).not.toBeNull();
    expect(within(region).getByText("Eight years in design systems.")).not.toBeNull();
    expect(within(region).getByText("The posting does not state pay.")).not.toBeNull();
    expect(within(region).getByText("Passes your hard filters.")).not.toBeNull();
  });

  it("names an untitled posting", async () => {
    renderBox();
    await submitWith(result({ roleTitle: null, companyName: null }));
    expect(within(resultRegion()).getByText("Untitled posting")).not.toBeNull();
  });

  it("names the role alone when the company is unknown", async () => {
    renderBox();
    await submitWith(result({ companyName: null }));
    expect(within(resultRegion()).getByText("Product Designer")).not.toBeNull();
  });

  it("lists the filters a posting misses and the ones it could not check", async () => {
    renderBox();
    await submitWith(result({ hardFilters: { pass: false, failed: ["title", "pay"], unchecked: ["location"] } }));
    const region = resultRegion();
    expect(within(region).getByText("Misses your hard filters: job title, pay floor.")).not.toBeNull();
    expect(within(region).getByText("Not checked: location.")).not.toBeNull();
  });

  it("says no filters are set, with a way to set them", async () => {
    renderBox({ hasHardFilters: false });
    await submitWith(result());
    const region = resultRegion();
    expect(within(region).getByText(/No hard filters set\./)).not.toBeNull();
    expect(within(region).queryByText("Passes your hard filters.")).toBeNull();
  });

  it.each([
    ["ai_off" as const, "Fit scoring needs AI, and AI is not turned on for this server."],
    ["failed" as const, "Scoring did not work this time. The job is saved as it is."],
  ])("explains a missing score: %s", async (note, line) => {
    renderBox();
    await submitWith(result({ fit: null, note }));
    const region = resultRegion();
    expect(within(region).getByText(line)).not.toBeNull();
    expect(region.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it("explains a missing resume with a link to Settings", async () => {
    renderBox();
    await submitWith(result({ fit: null, note: "no_resume" }));
    const link = within(resultRegion()).getByRole("link", { name: "Open Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(link.classList.contains("underline")).toBe(true);
  });

  it("announces the result", async () => {
    renderBox();
    await submitWith(result());
    const live = document.querySelector('div[role="status"][aria-live="polite"]');
    // The announcer sets its text on the next tick, so wait for it.
    await waitFor(() => expect(live?.textContent).toBe("Tested Product Designer at Northwind Traders. Fit score 81."));
  });

  it("shows field errors under the fields and puts focus back on Test", async () => {
    renderBox();
    await submitWith(
      {
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { postingText: "Paste a link or the posting text." },
      },
      { text: "" },
    );
    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    const text = screen.getByLabelText("Posting text");
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(text.getAttribute("aria-describedby")).toContain(
      screen.getByText("Paste a link or the posting text.").id,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Test" }));
  });

  it("asks for the pasted text and focuses its field when a link cannot be read", async () => {
    renderBox();
    await submitWith(
      { ok: false, code: "needs_text", message: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead." },
      { link: "https://www.linkedin.com/jobs/view/1000000001/", text: "" },
    );
    expect(screen.getByRole("alert").textContent).toContain("Paste the posting text instead.");
    expect(document.activeElement).toBe(screen.getByLabelText("Posting text"));
  });

  it("shows a server error and keeps the form usable", async () => {
    renderBox();
    await submitWith({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Try again.");
    expect((screen.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears the previous result and error when it runs again", async () => {
    renderBox();
    await submitWith(result());
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).not.toBeNull();
    await submitWith({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
    expect(screen.queryByRole("heading", { level: 3, name: "Result" })).toBeNull();
  });
});
