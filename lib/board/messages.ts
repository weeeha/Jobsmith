import { messageFor } from "@/lib/pipeline/messages";

export type BoardActionVerb = "move" | "close" | "reopen";

/**
 * The one shared failure-toast template for every board action that can
 * fail after an optimistic update - move, close and reopen all read
 * "Could not <verb> <role> at <company>. <cause>", differing only in the
 * verb (a close or reopen failure must not say "move"). `messageFor(code)`
 * still supplies the real cause, unchanged.
 */
export function actionFailureMessage(
  verb: BoardActionVerb,
  subject: { roleTitle: string; companyName: string },
  code: string,
): string {
  return `Could not ${verb} ${subject.roleTitle} at ${subject.companyName}. ${messageFor(code)}`;
}
