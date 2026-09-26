import { startTransition, type FormEvent } from "react";

/**
 * Sent in place of a field whose text the browser could not read. A number
 * box holding text like "12e" reports `validity.badInput` and the value "",
 * and script has no way to read the text itself, so this fixed string
 * stands in for it. It is not blank and not a number, so the server
 * actions reject it with their usual "Enter a number." instead of reading
 * it as a blank box (which Add job takes as "no figure" and Edit details
 * as "clear the figure").
 */
export const UNREADABLE_INPUT_VALUE = "unreadable";

/**
 * Builds `form`'s own FormData, replacing any field whose text the browser
 * could not read with UNREADABLE_INPUT_VALUE, sets every entry in `extra`
 * on top (added or overwritten), and calls `dispatch` with the result
 * inside a transition, so React 19 never runs requestFormReset (see
 * submitViaTransition's own comment below for why that matters).
 *
 * `submitViaTransition` is this function's own thin wrapper around a real
 * submit event. A control with no submit event to prevent the default on -
 * the Add job dialog's "Add anyway", a type="button" that still has to
 * reach the same FormData-building and stand-in logic, plus one extra
 * `intent` entry - calls this directly instead.
 */
export function submitFormData(
  form: HTMLFormElement,
  dispatch: (formData: FormData) => void,
  extra?: Record<string, string>,
): void {
  const formData = new FormData(form);
  for (const element of form.elements) {
    // `has` skips fields FormData left out on purpose (unnamed or disabled).
    if (element instanceof HTMLInputElement && element.validity.badInput && formData.has(element.name)) {
      formData.set(element.name, UNREADABLE_INPUT_VALUE);
    }
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      formData.set(key, value);
    }
  }
  startTransition(() => {
    dispatch(formData);
  });
}

/**
 * Shared submit path for every form here that is wired to a
 * `useActionState` dispatch function. React 19 calls `requestFormReset`
 * after every native `<form action={fn}>` dispatch settles, regardless of
 * success or failure, which resets every uncontrolled field back to its
 * `defaultValue` - wiping whatever the user typed even when the server
 * rejected the submission (confirmed empirically against add-job-dialog.tsx
 * and edit-details-dialog.tsx). Calling `dispatch`
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
  submitFormData(event.currentTarget, dispatch);
}
