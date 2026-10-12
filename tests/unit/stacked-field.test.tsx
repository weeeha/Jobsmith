// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StackedField } from "@/components/forms/stacked-field";

function field(props: { hint?: string; error?: string }) {
  return render(
    <StackedField label="Headline" {...props}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} />}
    </StackedField>,
  );
}

describe("StackedField", () => {
  it("puts the label above the control and ties them together", () => {
    field({});
    const control = screen.getByLabelText("Headline");
    expect(control.tagName).toBe("INPUT");
    const label = screen.getByText("Headline");
    expect(label.tagName).toBe("LABEL");
    // Document order: the label comes before the control it names.
    expect(label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives the control no description when there is no hint or error", () => {
    field({});
    expect(screen.getByLabelText("Headline").getAttribute("aria-describedby")).toBeNull();
  });

  it("points the control at the hint", () => {
    field({ hint: "A short line about you." });
    const control = screen.getByLabelText("Headline");
    const hint = screen.getByText("A short line about you.");
    expect(control.getAttribute("aria-describedby")).toBe(hint.id);
    expect(hint.className).toContain("text-muted-foreground");
  });

  it("points the control at the hint and the error, in that order", () => {
    field({ hint: "A short line about you.", error: "Keep the headline under 200 characters." });
    const control = screen.getByLabelText("Headline");
    const hint = screen.getByText("A short line about you.");
    const error = screen.getByText("Keep the headline under 200 characters.");
    expect(control.getAttribute("aria-describedby")).toBe(`${hint.id} ${error.id}`);
    expect(error.className).toContain("text-destructive");
  });
});
