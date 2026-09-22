"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { toInstant, toLocalInputValue } from "@/lib/time/local";

export function LocalDateTimeInput({
  id,
  name,
  defaultValue,
  "aria-describedby": ariaDescribedBy,
}: {
  id: string;
  name: string;
  defaultValue: string | null;
  "aria-describedby"?: string;
}) {
  const [localValue, setLocalValue] = React.useState(() =>
    defaultValue ? toLocalInputValue(defaultValue) : "",
  );

  return (
    <>
      {/* No name attribute: this field is never submitted on its own. The
          hidden input below carries the real ISO instant under the caller's
          name, so the server action only ever sees a valid instant or "". */}
      <Input
        id={id}
        type="datetime-local"
        value={localValue}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => setLocalValue(event.target.value)}
      />
      <input type="hidden" name={name} value={toInstant(localValue)} />
    </>
  );
}
