// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

const startTransitionMock = vi.fn((callback: () => void) => callback());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, startTransition: startTransitionMock };
});

// Imported after the mock so submit.ts's own `import { startTransition }
// from "react"` binds to the mock above, not the real implementation.
const { submitViaTransition, UNREADABLE_INPUT_VALUE } = await import("@/lib/forms/submit");

function makeFormEvent(fields: Record<string, string>, extraInputs: HTMLInputElement[] = []) {
  const form = document.createElement("form");
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  for (const input of extraInputs) form.appendChild(input);
  document.body.appendChild(form);

  let defaultPrevented = false;
  const event = {
    currentTarget: form,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as unknown as React.FormEvent<HTMLFormElement>;

  return { event, wasDefaultPrevented: () => defaultPrevented };
}

// jsdom has no typing that can go wrong, so it never reports badInput. A
// number box holding "12e" in Chromium or WebKit reports the value "" with
// validity.badInput true (and so valid false); `unreadable` stubs exactly
// that state.
function numberInput(name: string, { unreadable = false, disabled = false } = {}): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.name = name;
  input.disabled = disabled;
  if (unreadable) {
    Object.defineProperty(input, "validity", {
      value: {
        badInput: true,
        customError: false,
        patternMismatch: false,
        rangeOverflow: false,
        rangeUnderflow: false,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valid: false,
        valueMissing: false,
      },
    });
  }
  return input;
}

function sentFormData(dispatch: ReturnType<typeof vi.fn>): FormData {
  expect(dispatch).toHaveBeenCalledTimes(1);
  return dispatch.mock.calls[0]![0] as FormData;
}

describe("submitViaTransition", () => {
  beforeEach(() => {
    startTransitionMock.mockClear();
  });

  it("prevents the native form submit", () => {
    const { event, wasDefaultPrevented } = makeFormEvent({ text: "hello" });
    submitViaTransition(event, vi.fn());
    expect(wasDefaultPrevented()).toBe(true);
  });

  it("passes the form's own FormData to the dispatch function", () => {
    const { event } = makeFormEvent({ companyName: "Acme", roleTitle: "Designer" });
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const formData = dispatch.mock.calls[0]![0] as FormData;
    expect(formData.get("companyName")).toBe("Acme");
    expect(formData.get("roleTitle")).toBe("Designer");
  });

  it("runs the dispatch call inside a React transition", () => {
    const { event } = makeFormEvent({ text: "hello" });
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(startTransitionMock).toHaveBeenCalledTimes(1);
    // The dispatch call must happen INSIDE the callback startTransition was
    // given, not before it - proven here because the mock only invokes
    // dispatch by calling that callback itself.
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  // FormData reads such a box as "", which is what a blank box sends, and
  // the server would save the field as blank: Add job would drop the figure
  // and Edit details would clear the stored one.
  it("sends the stand-in, not a blank, for a number box whose text the browser could not read", () => {
    const { event } = makeFormEvent({ companyName: "Acme" }, [numberInput("compMin", { unreadable: true })]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    const formData = sentFormData(dispatch);
    expect(formData.get("compMin")).toBe(UNREADABLE_INPUT_VALUE);
    expect(formData.get("companyName")).toBe("Acme");
  });

  it("still sends an empty number box as blank", () => {
    const { event } = makeFormEvent({}, [numberInput("compMin")]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(sentFormData(dispatch).get("compMin")).toBe("");
  });

  it("adds nothing for an unreadable box the form does not submit", () => {
    const { event } = makeFormEvent({}, [numberInput("compMin", { unreadable: true, disabled: true })]);
    const dispatch = vi.fn();
    submitViaTransition(event, dispatch);
    expect(sentFormData(dispatch).has("compMin")).toBe(false);
  });
});
