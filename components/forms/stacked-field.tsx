"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";

interface StackedFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (controlId: string, describedBy: string | undefined) => React.ReactNode;
}

/**
 * A label above its control, with a hint and an error below it. `FieldRow`
 * puts the label in a fixed 6rem column beside the control, which wraps long
 * labels such as "Apply or drop after" onto three lines.
 */
export function StackedField({ label, hint, error, children }: StackedFieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id, describedBy)}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
