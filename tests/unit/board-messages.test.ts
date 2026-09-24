import { describe, expect, it } from "vitest";
import { actionFailureMessage } from "@/lib/board/messages";

const subject = { roleTitle: "Product Designer", companyName: "Acme Robotics" };

describe("actionFailureMessage", () => {
  it("uses the given verb", () => {
    expect(actionFailureMessage("move", subject, "same_column")).toBe(
      "Could not move Product Designer at Acme Robotics. It is already in this column.",
    );
  });

  it("swaps in a different verb for the same template and cause", () => {
    expect(actionFailureMessage("close", subject, "not_found")).toBe(
      "Could not close Product Designer at Acme Robotics. This job no longer exists.",
    );
  });

  it("swaps in reopen for its own failure codes", () => {
    expect(actionFailureMessage("reopen", subject, "not_closed")).toBe(
      "Could not reopen Product Designer at Acme Robotics. This job is not closed.",
    );
  });

  it("falls through messageFor's own default for an unrecognized code", () => {
    expect(actionFailureMessage("reopen", subject, "unexpected")).toBe(
      "Could not reopen Product Designer at Acme Robotics. Something went wrong. Try again.",
    );
  });
});
