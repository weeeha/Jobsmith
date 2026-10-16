"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface ChipFieldProps {
  id: string;
  name: string;
  defaultValues?: readonly string[];
  placeholder?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
}

/**
 * A multi-value text field: chips plus a text input inside one bordered box.
 * Every chip is submitted as its own hidden input named `name`, so the server
 * reads the list with FormData.getAll. The text input has no name; typed but
 * unconfirmed text is added on blur, so it is never lost on submit.
 */
export function ChipField({
  id,
  name,
  defaultValues = [],
  placeholder,
  "aria-describedby": describedBy,
  invalid,
}: ChipFieldProps) {
  const [values, setValues] = React.useState<string[]>(() => [...defaultValues]);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Commas separate entries, so pasted text like "Remote, New York" becomes two chips.
  function commit(text: string) {
    setDraft("");
    const parts = text.split(",").map((part) => part.trim()).filter((part) => part !== "");
    if (parts.length === 0) return;
    setValues((current) => {
      const next = [...current];
      for (const value of parts) {
        const key = value.toLocaleLowerCase();
        if (!next.some((v) => v.toLocaleLowerCase() === key)) next.push(value);
      }
      return next;
    });
  }

  function remove(index: number) {
    setValues((current) => current.filter((_, i) => i !== index));
    // The clicked remove button leaves the page; keep focus in the field.
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter while an input method is composing confirms the composition, not the chip.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" || event.key === ",") {
      // Enter must not submit the surrounding form, and a comma is a separator, not text.
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "") {
      setValues((current) => current.slice(0, -1));
    }
  }

  return (
    <div
      data-slot="chip-field"
      // The box is bigger than the input, so a click on its padding still lands in the input.
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
      className={cn(
        "flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent py-0.5 pr-2.5 pl-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20 focus-within:border-destructive dark:border-destructive/50 dark:ring-destructive/40",
      )}
    >
      {values.map((value, index) => (
        <span
          key={value.toLocaleLowerCase()}
          className="flex h-6 max-w-full items-center gap-1 rounded-md bg-muted pr-1 pl-2 text-xs font-medium text-foreground"
        >
          <span className="min-w-0 break-words">{value}</span>
          <button
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => remove(index)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-3" aria-hidden="true" />
          </button>
          <input type="hidden" name={name} value={value} />
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
