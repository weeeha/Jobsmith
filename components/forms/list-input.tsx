"use client";

import * as React from "react";
import { X } from "lucide-react";

import { useAnnounce } from "@/components/live-announcer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_ITEM_CHARS, MAX_LIST_ITEMS } from "@/lib/preferences/schema";

interface ListInputProps {
  /** The form field name; every entry is posted under it, one hidden input each. */
  name: string;
  label: string;
  hint?: string;
  error?: string;
  placeholder: string;
  defaultValue: string[];
}

const LIMIT_MESSAGE = `Lists hold up to ${MAX_LIST_ITEMS} entries.`;
const TOO_LONG_MESSAGE = `Keep each entry under ${MAX_ITEM_CHARS} characters.`;

type Focus = { entry: string } | "input" | null;

/**
 * A list of short strings: chips with remove buttons and a box to add more.
 * Enter in the box adds an entry and never submits the surrounding form.
 */
export function ListInput({ name, label, hint, error, placeholder, defaultValue }: ListInputProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const announce = useAnnounce();

  // A snapshot: a save re-renders the page with new props, and the list keeps
  // what is on screen.
  const [entries, setEntries] = React.useState<string[]>(() => [...defaultValue]);
  const [draft, setDraft] = React.useState("");
  const [refusal, setRefusal] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const removeButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = React.useRef<Focus>(null);

  const full = entries.length >= MAX_LIST_ITEMS;
  const status = full ? LIMIT_MESSAGE : refusal;

  React.useEffect(() => {
    // Runs after a removal has been drawn, so the target exists (and the box
    // is enabled again when the list was full).
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "input") inputRef.current?.focus();
    else removeButtons.current.get(target.entry)?.focus();
  }, [entries]);

  function add() {
    const entry = draft.trim();
    if (entry === "") return;
    if (entry.length > MAX_ITEM_CHARS) {
      setRefusal(TOO_LONG_MESSAGE);
      return;
    }
    if (entries.some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
      setRefusal(`${entry} is already in the list.`);
      return;
    }
    setEntries([...entries, entry]);
    setDraft("");
    setRefusal("");
    announce(`Added ${entry}.`);
    inputRef.current?.focus();
  }

  function remove(entry: string) {
    const index = entries.indexOf(entry);
    const neighbour = entries[index + 1] ?? entries[index - 1];
    pendingFocus.current = neighbour === undefined ? "input" : { entry: neighbour };
    setEntries(entries.filter((existing) => existing !== entry));
    announce(`Removed ${entry}.`);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>

      {entries.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <li key={entry} className="max-w-full">
              <Badge variant="secondary" className="h-auto max-w-full gap-1 py-0.5 pr-0.5 break-words whitespace-normal">
                <span className="min-w-0 break-words">{entry}</span>
                <Button
                  ref={(node) => {
                    if (node) removeButtons.current.set(entry, node);
                    else removeButtons.current.delete(entry);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${entry}`}
                  onClick={() => remove(entry)}
                >
                  <X aria-hidden />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          aria-label={`New entry for ${label}`}
          aria-describedby={describedBy}
          aria-invalid={refusal !== ""}
          disabled={full}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefusal("");
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter belongs to the box: it never submits the form around it.
            event.preventDefault();
            if (!event.nativeEvent.isComposing) add();
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={full} onClick={add}>
          Add
        </Button>
      </div>

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
      <p role="status" className="text-muted-foreground text-sm empty:hidden">
        {status}
      </p>

      {entries.map((entry) => (
        <input key={entry} type="hidden" name={name} value={entry} />
      ))}
    </fieldset>
  );
}
