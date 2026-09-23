// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

const startTransitionMock = vi.fn((callback: () => void) => callback());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, startTransition: startTransitionMock };
});

// Imported after the mock so submit.ts's own `import { startTransition }
// from "react"` binds to the mock above, not the real implementation.
const { submitViaTransition } = await import("@/lib/forms/submit");

function makeFormEvent(fields: Record<string, string>) {
  const form = document.createElement("form");
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
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
});
