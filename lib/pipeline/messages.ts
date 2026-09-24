const MESSAGES: Record<string, string> = {
  closed: "This job is closed. Reopen it first.",
  not_found: "This job no longer exists.",
  same_stage: "It is already in this stage.",
  same_column: "It is already in this column.",
  fixed_stage: "Saved, Applied and Offer always stay.",
  stage_current: "This is the current stage.",
  stage_done: "A finished stage stays in the history.",
  stage_has_artifacts: "This stage has documents.",
  invalid_order: "That order is not allowed.",
  label_required: "Give the stage a name.",
  not_skippable: "Only upcoming stages can be skipped.",
  not_skipped: "This stage is not skipped.",
  duplicate: "You already track this role at this company.",
  invalid: "Check the highlighted fields.",
  nothing_to_complete: "There is no next action.",
  not_closed: "This job is not closed.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Try again.";
}
