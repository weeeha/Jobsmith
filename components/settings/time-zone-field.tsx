"use client";

import * as React from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

const MAX_SUGGESTIONS = 8;

export function filterZones(zones: string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return zones.slice(0, MAX_SUGGESTIONS);
  const out: string[] = [];
  for (const zone of zones) {
    if (zone.toLowerCase().includes(needle)) {
      out.push(zone);
      if (out.length === MAX_SUGGESTIONS) break;
    }
  }
  return out;
}

interface TimeZoneFieldProps {
  id: string;
  name: string;
  zones: string[];
  defaultValue: string;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Combobox over the zone list. The input's own text is what the form
 * submits (name on the input, not a hidden field), so a typed zone the list
 * does not hold still reaches the server, which owns rejecting it.
 */
export function TimeZoneField({ id, name, zones, defaultValue, invalid, describedBy }: TimeZoneFieldProps) {
  const [text, setText] = React.useState(defaultValue);
  const suggestions = React.useMemo(() => filterZones(zones, text), [zones, text]);

  return (
    <Combobox
      items={suggestions}
      // Filtering is done above (substring, capped), not by the primitive.
      filter={null}
      inputValue={text}
      onInputValueChange={(value) => setText(value)}
      onValueChange={(value) => {
        if (typeof value === "string") setText(value);
      }}
    >
      <ComboboxInput
        id={id}
        name={name}
        showTrigger={false}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      {/* The vendored popup is 7 spacing units wider than its anchor to clear a
          trigger button; this field has none, so it matches the input instead. */}
      <ComboboxContent className="min-w-(--anchor-width)">
        <ComboboxList>
          {(zone: string) => (
            <ComboboxItem key={zone} value={zone}>
              {zone}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
