"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SNOOZE_OPTIONS, type SnoozeDays } from "@/lib/attention/snooze";

export function SnoozeMenu({
  disabled,
  onSnooze,
  triggerRef,
}: {
  disabled: boolean;
  onSnooze: (days: SnoozeDays) => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button ref={triggerRef} variant="ghost" size="sm" disabled={disabled} />}>
        Snooze
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      {/* The popup is as wide as its trigger by default, too narrow for "In 3 days". */}
      <DropdownMenuContent align="end" className="min-w-36">
        {SNOOZE_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.days} onClick={() => onSnooze(option.days)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
