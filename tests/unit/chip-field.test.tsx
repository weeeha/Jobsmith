// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChipField } from "@/components/chip-field";

function setup(defaultValues: string[] = []) {
  const { container } = render(
    <form>
      <label htmlFor="f">Titles</label>
      <ChipField id="f" name="titles" defaultValues={defaultValues} placeholder="Add a title" />
    </form>,
  );
  const input = screen.getByLabelText("Titles") as HTMLInputElement;
  const hidden = () =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="titles"]')).map((i) => i.value);
  return { input, hidden };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("ChipField", () => {
  it("renders the default values as chips and hidden inputs", () => {
    const { hidden } = setup(["Designer", "Lead"]);
    expect(hidden()).toEqual(["Designer", "Lead"]);
    expect(screen.getByRole("button", { name: "Remove Designer" })).toBeTruthy();
  });

  it("adds a trimmed value on Enter and clears the box", () => {
    const { input, hidden } = setup();
    type(input, "  Design lead ");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hidden()).toEqual(["Design lead"]);
    expect(input.value).toBe("");
  });

  it("adds a value on comma without typing the comma", () => {
    const { input, hidden } = setup();
    type(input, "Remote");
    const notPrevented = fireEvent.keyDown(input, { key: "," });
    expect(notPrevented).toBe(false);
    expect(hidden()).toEqual(["Remote"]);
  });

  it("ignores blank text and case-insensitive duplicates", () => {
    const { input, hidden } = setup(["Remote"]);
    type(input, "   ");
    fireEvent.keyDown(input, { key: "Enter" });
    type(input, "remote");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hidden()).toEqual(["Remote"]);
    expect(input.value).toBe("");
  });

  it("removes the last chip on Backspace in an empty input only", () => {
    const { input, hidden } = setup(["A", "B"]);
    type(input, "x");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(hidden()).toEqual(["A", "B"]);
    type(input, "");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(hidden()).toEqual(["A"]);
  });

  it("removes a chip with its remove button", () => {
    const { hidden } = setup(["A", "B"]);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Remove A" }));
    });
    expect(hidden()).toEqual(["B"]);
  });

  it("adds pending text when the field loses focus", () => {
    const { input, hidden } = setup();
    type(input, "Pending");
    fireEvent.blur(input);
    expect(hidden()).toEqual(["Pending"]);
  });
});
