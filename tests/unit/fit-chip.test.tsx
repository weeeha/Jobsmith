// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FitChip } from "@/components/fit/fit-chip";

function renderChip(score: number, size?: "sm" | "default") {
  const { container } = render(<FitChip score={score} size={size} />);
  const chip = container.querySelector('[data-slot="badge"]') as HTMLElement;
  const mark = chip.querySelector("svg") as SVGElement;
  return { chip, mark };
}

describe("FitChip", () => {
  it("shows the number with screen-reader text that names the score and the band", () => {
    const { chip } = renderChip(81);
    expect(chip.textContent).toBe("Fit score 81, strong fit");
    const visible = Array.from(chip.childNodes)
      .filter((node) => !(node instanceof Element && (node.classList.contains("sr-only") || node.tagName === "svg")))
      .map((node) => node.textContent);
    expect(visible).toEqual(["81"]);
  });

  it("names the partial and weak bands", () => {
    expect(renderChip(55).chip.textContent).toBe("Fit score 55, partial fit");
    expect(renderChip(12).chip.textContent).toBe("Fit score 12, weak fit");
  });

  it("puts the band on the boundaries at 70 and 40", () => {
    expect(renderChip(70).chip.textContent).toContain("strong fit");
    expect(renderChip(69).chip.textContent).toContain("partial fit");
    expect(renderChip(40).chip.textContent).toContain("partial fit");
    expect(renderChip(39).chip.textContent).toContain("weak fit");
  });

  it("carries the tone on a hidden mark, one token per band", () => {
    for (const [score, token, icon] of [
      [81, "text-status-approved", "lucide-circle-check"],
      [55, "text-status-pending", "lucide-circle-dot"],
      [12, "text-status-action", "lucide-circle-minus"],
    ] as const) {
      const { mark } = renderChip(score);
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.classList.contains(token)).toBe(true);
      expect(mark.classList.contains(icon)).toBe(true);
    }
  });

  it("never colors the label text", () => {
    const { chip } = renderChip(81);
    expect(chip.className).not.toMatch(/text-status-/);
    expect(chip.className).toMatch(/text-foreground/);
  });

  it("is larger in the default size than in the small one", () => {
    expect(renderChip(81, "sm").chip.className).not.toBe(renderChip(81, "default").chip.className);
    expect(renderChip(81).chip.className).toBe(renderChip(81, "default").chip.className);
  });
});
