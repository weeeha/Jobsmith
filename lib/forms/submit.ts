import { startTransition, type FormEvent } from "react";

/**
 * Shared submit path for every form here that is wired to a
 * `useActionState` dispatch function. React 19 calls `requestFormReset`
 * after every native `<form action={fn}>` dispatch settles, regardless of
 * success or failure, which resets every uncontrolled field back to its
 * `defaultValue` - wiping whatever the user typed even when the server
 * rejected the submission (confirmed empirically against add-job-dialog.tsx
 * and edit-details-dialog.tsx: Task 11's report). Calling `dispatch`
 * directly, inside a transition, instead of wiring it to the form's own
 * `action` prop, never enters that native dispatch path, so
 * `requestFormReset` never fires.
 *
 * `dispatch` is a `useActionState` dispatch function (or anything with the
 * same `(formData: FormData) => void` shape) - the same one that would
 * otherwise be passed as `<form action={dispatch}>`.
 */
export function submitViaTransition(
  event: FormEvent<HTMLFormElement>,
  dispatch: (formData: FormData) => void,
): void {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  startTransition(() => {
    dispatch(formData);
  });
}
