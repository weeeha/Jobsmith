// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ListInput } from "@/components/forms/list-input";

// No jest-dom here (see add-job-dialog.test.tsx); assertions read the DOM.

function renderList(props: Partial<React.ComponentProps<typeof ListInput>> = {}, onSubmit = vi.fn()) {
  render(
    <LiveAnnouncerProvider>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <ListInput name="titles" label="Job titles" placeholder="Add a title" defaultValue={[]} {...props} />
      </form>
    </LiveAnnouncerProvider>,
  );
  const group = screen.getByRole("group", { name: "Job titles" });
  return { group, onSubmit };
}

const input = () => screen.getByLabelText("New entry for Job titles") as HTMLInputElement;
const addButton = (group: HTMLElement) => within(group).getByRole("button", { name: "Add" }) as HTMLButtonElement;
const hiddenValues = (group: HTMLElement) =>
  [...group.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="titles"]')].map((node) => node.value);
// The fieldset's own always-rendered status line, not the page-wide announcer.
const statusOf = (group: HTMLElement) => within(group).getByRole("status").textContent;
const chipNames = (group: HTMLElement) =>
  within(group)
    .queryAllByRole("button", { name: /^Remove / })
    .map((button) => button.getAttribute("aria-label"));

async function type(value: string) {
  await act(async () => {
    fireEvent.change(input(), { target: { value } });
  });
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(input(), { key });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ListInput", () => {
  it("is a group named by its label, with a chip, a remove button and a hidden input per entry", () => {
    const { group } = renderList({ defaultValue: ["Product Designer", "Design Lead"], hint: "A job passes when its title matches." });
    expect(within(group).getByRole("list", { name: "Job titles" }).querySelectorAll("li")).toHaveLength(2);
    expect(chipNames(group)).toEqual(["Remove Product Designer", "Remove Design Lead"]);
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead"]);
    expect(input().placeholder).toBe("Add a title");
    expect(within(group).getByText("A job passes when its title matches.")).not.toBeNull();
    expect(statusOf(group)).toBe("");
  });

  // The box's text is posted as one more entry when the form is submitted
  // without pressing Add, under the same rules as Add.
  it("posts text typed but not added as one more entry, trimmed", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("  Design Lead  ");
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead"]);
    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
  });

  it("posts nothing extra for a blank box or a case-insensitive duplicate", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("   ");
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
    await type("product DESIGNER");
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
  });

  it("posts an over-long box as typed, for the server to refuse with its own message", async () => {
    const { group } = renderList();
    await type("x".repeat(81));
    expect(hiddenValues(group)).toEqual(["x".repeat(81)]);
  });

  it("folds the posted text into the chips and empties the box when a save succeeds", async () => {
    function Harness({ saved }: { saved?: object }) {
      return (
        <LiveAnnouncerProvider>
          <form>
            <ListInput name="titles" label="Job titles" placeholder="Add a title" defaultValue={["Product Designer"]} saved={saved} />
          </form>
        </LiveAnnouncerProvider>
      );
    }
    const view = render(<Harness />);
    const group = screen.getByRole("group", { name: "Job titles" });
    await type("Design Lead");
    await act(async () => {
      group.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // Typing after the submit is not part of what was saved.
    await type("Design Lead and more");
    expect(chipNames(group)).toEqual(["Remove Product Designer"]);

    view.rerender(<Harness saved={{}} />);
    expect(chipNames(group)).toEqual(["Remove Product Designer", "Remove Design Lead"]);
    expect(hiddenValues(group)).toEqual(["Product Designer", "Design Lead", "Design Lead and more"]);
    expect(input().value).toBe("Design Lead and more");
  });

  it("lets an 80-character entry break inside the word, in the chip and its text", () => {
    const long = "y".repeat(80);
    const { group } = renderList({ defaultValue: [long] });
    const chip = within(group).getByRole("listitem");
    expect(chip.className).toContain("max-w-full");
    const badge = chip.querySelector('[data-slot="badge"]') as HTMLElement;
    expect(badge.className).toContain("max-w-full");
    expect(badge.className).toContain("break-words");
    const text = within(badge).getByText(long);
    expect(text.className).toContain("min-w-0");
    expect(text.className).toContain("break-words");
    expect(group.className).toContain("min-w-0");
  });

  it("renders no list when there are no entries", () => {
    const { group } = renderList();
    expect(within(group).queryByRole("list")).toBeNull();
    expect(hiddenValues(group)).toEqual([]);
  });

  it("describes the input by the hint and the error", () => {
    const { group } = renderList({ hint: "A job passes when its title matches.", error: "Keep the list to 20 entries." });
    const hint = within(group).getByText("A job passes when its title matches.");
    const error = within(group).getByText("Keep the list to 20 entries.");
    expect(input().getAttribute("aria-describedby")?.split(" ")).toEqual([hint.id, error.id]);
    expect(error.className).toContain("text-destructive");
  });

  it("adds an entry on Enter without submitting the form, trims it, clears the box and announces it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { group, onSubmit } = renderList();
    await type("  Product Designer  ");
    await press("Enter");

    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
    expect(hiddenValues(group)).toEqual(["Product Designer"]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Added Product Designer.");
  });

  it("does not treat Enter in the box as a form submit even when the box is empty", async () => {
    const { onSubmit } = renderList();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      input().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("adds with the Add button and ignores a blank box", async () => {
    const { group } = renderList();
    await type("   ");
    await act(async () => {
      fireEvent.click(addButton(group));
    });
    expect(chipNames(group)).toEqual([]);
    expect(statusOf(group)).toBe("");

    await type("Design Lead");
    await act(async () => {
      fireEvent.click(addButton(group));
    });
    expect(chipNames(group)).toEqual(["Remove Design Lead"]);
  });

  it("refuses a duplicate in any letter case and says so in the status line", async () => {
    const { group } = renderList({ defaultValue: ["Product Designer"] });
    await type("product designer");
    await press("Enter");

    expect(chipNames(group)).toEqual(["Remove Product Designer"]);
    expect(statusOf(group)).toBe("product designer is already in the list.");
    // The text stays so it can be corrected, and typing clears the message.
    expect(input().value).toBe("product designer");
    await type("product designer 2");
    expect(statusOf(group)).toBe("");
  });

  it("refuses an entry over 80 characters and accepts one of exactly 80", async () => {
    const { group } = renderList();
    await type("x".repeat(81));
    await press("Enter");
    expect(chipNames(group)).toEqual([]);
    expect(statusOf(group)).toBe("Keep each entry under 80 characters.");

    await type("y".repeat(80));
    await press("Enter");
    expect(chipNames(group)).toHaveLength(1);
    expect(statusOf(group)).toBe("");
  });

  it("stops at 20 entries: the box and Add are disabled and the status says why", async () => {
    const nineteen = Array.from({ length: 19 }, (_, index) => `Title ${index + 1}`);
    const { group } = renderList({ defaultValue: nineteen });
    expect(input().disabled).toBe(false);
    await type("Title 20");
    await press("Enter");

    expect(chipNames(group)).toHaveLength(20);
    expect(input().disabled).toBe(true);
    expect(addButton(group).disabled).toBe(true);
    expect(statusOf(group)).toBe("Lists hold up to 20 entries.");

    // Removing one brings the box back.
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Remove Title 20" }));
    });
    expect(input().disabled).toBe(false);
    expect(statusOf(group)).toBe("");
  });

  it("moves focus to the next chip's remove button, else the previous, else the box, and announces", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { group } = renderList({ defaultValue: ["Alpha", "Bravo", "Charlie"] });
    const remove = (name: string) => within(group).getByRole("button", { name: `Remove ${name}` });

    await act(async () => {
      fireEvent.click(remove("Bravo"));
    });
    expect(hiddenValues(group)).toEqual(["Alpha", "Charlie"]);
    expect(document.activeElement).toBe(remove("Charlie"));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toContain("Removed Bravo.");

    await act(async () => {
      fireEvent.click(remove("Charlie"));
    });
    expect(document.activeElement).toBe(remove("Alpha"));

    await act(async () => {
      fireEvent.click(remove("Alpha"));
    });
    expect(hiddenValues(group)).toEqual([]);
    expect(document.activeElement).toBe(input());
  });
});
