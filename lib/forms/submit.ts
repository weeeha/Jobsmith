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
 *
 * It also sends UNREADABLE_INPUT_VALUE for any field whose text the browser
 * could not read. A form that validates natively never reaches this point
 * with such a field (the browser blocks the submit), but a `noValidate`
 * form does, and FormData alone would send the field as blank.
 */
export function submitViaTransition(
  event: FormEvent<HTMLFormElement>,
  dispatch: (formData: FormData) => void,
): void {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  for (const element of form.elements) {
    // `has` skips fields FormData left out on purpose (unnamed or disabled).
    if (element instanceof HTMLInputElement && element.validity.badInput && formData.has(element.name)) {
      formData.set(element.name, UNREADABLE_INPUT_VALUE);
    }
  }
  startTransition(() => {
    dispatch(formData);
  });
}
