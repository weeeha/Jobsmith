// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ChangeNavigator } from "@/components/compare/change-navigator";
import { VersionPicker } from "@/components/compare/version-picker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

let hidden: Set<string>;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = new Set();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return hidden.has(this.id) ? null : document.body;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  push.mockReset();
});

function setup(total = 3) {
  return render(
    <LiveAnnouncerProvider>
      <ChangeNavigator total={total} />
      {Array.from({ length: total }, (_, i) => (
        <div key={i}>
          <p id={`c${i}-split`} data-change={i + 1}>split {i + 1}</p>
          <p id={`c${i}-inline`} data-change={i + 1}>inline {i + 1}</p>
        </div>
      ))}
      <input aria-label="field" />
    </LiveAnnouncerProvider>,
  );
}
const press = (key: string, target: Element = document.body) => fireEvent.keyDown(target, { key });
const announced = () => screen.getByRole("status").textContent;

describe("ChangeNavigator", () => {
  it("rests on the count, then ] focuses, scrolls and announces; [ goes back", () => {
    for (let i = 0; i < 3; i++) hidden.add(`c${i}-inline`);
    setup();
    expect(screen.getByText("3 changes")).toBeTruthy();
    press("]");
    act(() => void vi.advanceTimersByTime(60));
    expect(document.activeElement?.id).toBe("c0-split");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(announced()).toBe("Change 1 of 3");
    press("]");
    act(() => void vi.advanceTimersByTime(60));
    expect(announced()).toBe("Change 2 of 3");
    press("[");
    act(() => void vi.advanceTimersByTime(60));
    expect(document.activeElement?.id).toBe("c0-split");
    expect(announced()).toBe("Change 1 of 3");
  });
  it("ignores keys while a text field has focus", () => {
    setup();
    press("]", screen.getByLabelText("field"));
    expect(screen.getByText("3 changes")).toBeTruthy();
  });
  it("skips the hidden view", () => {
    for (let i = 0; i < 3; i++) hidden.add(`c${i}-split`);
    setup();
    press("]");
    expect(document.activeElement?.id).toBe("c0-inline");
  });
  it("disables Previous at the first change and Next at the last", () => {
    setup(2);
    const prev = screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });
  it("uses the no-op state for zero changes", () => {
    setup(0);
    expect(screen.getByText("No changes")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("VersionPicker", () => {
  const versions = [1, 2, 3, 4].map((v) => ({ version: v, label: `Version ${v}` }));
  const hrefFor = (a: number, b: number) => `/jobs/j?doc=cover&a=${a}&b=${b}&view=split`;

  it("has two labelled selects and a Versions 3 and 4 sheet button", () => {
    render(<VersionPicker versions={versions} a={3} b={4} hrefFor={hrefFor} />);
    expect(screen.getByLabelText("Older version")).toBeTruthy();
    expect(screen.getByLabelText("Newer version")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Versions 3 and 4" }));
    expect(screen.getAllByLabelText("Older version").length).toBe(2);
  });
  it("navigates to hrefFor on choice", () => {
    render(<VersionPicker versions={versions} a={3} b={4} hrefFor={hrefFor} />);
    fireEvent.change(screen.getByLabelText("Older version"), { target: { value: "2" } });
    expect(push).toHaveBeenCalledWith("/jobs/j?doc=cover&a=2&b=4&view=split");
    fireEvent.change(screen.getByLabelText("Newer version"), { target: { value: "3" } });
    expect(push).toHaveBeenLastCalledWith("/jobs/j?doc=cover&a=3&b=3&view=split");
  });
});
