import { toast } from "sonner";

export const NEXT_ACTION_OFFER_MS = 10_000;

/**
 * The prompt after a successful move: a toast that names the job and holds
 * one button. Nothing opens on its own, so a keyboard user is never pulled
 * out of the board; the dialog opens only when the button (or the toast
 * hotkey) is used.
 */
export function offerNextAction(subject: { roleTitle: string; companyName: string }, open: () => void): void {
  toast(`What is next for ${subject.roleTitle} at ${subject.companyName}?`, {
    action: { label: "Set next action", onClick: open },
    duration: NEXT_ACTION_OFFER_MS,
  });
}
