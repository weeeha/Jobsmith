"use client";

import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import type { MoveTarget } from "@/lib/pipeline/rules";
import type { BoardCard } from "@/lib/db/scoped";

interface MoveMenuProps {
  card: BoardCard;
  onMove: (target: MoveTarget) => void;
  onRequestClose: () => void;
}

/**
 * Every card's non-drag twin for a move. Lists the seven columns plus
 * "Close", and calls the exact same `onMove`/`onRequestClose` callbacks a
 * drop and the number keys call, so a drag, a keypress and this menu all
 * end up running board.tsx's one runMove/runClose implementation. This is
 * also the control the phone sheet reuses, by calling the same callbacks
 * rather than importing this component.
 */
export function MoveMenu({ card, onMove, onRequestClose }: MoveMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${card.roleTitle} at ${card.companyName}`}
          />
        }
      >
        <MoreVertical aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {STAGE_KINDS.map((stage) => (
          // The card's current column is disabled rather than omitted, so
          // the "this is a no-op" fact is visible in the menu instead of
          // just silently doing nothing if chosen. runMove's own
          // same-column guard is what actually makes choosing it a no-op;
          // this is the visible half of that fix.
          <DropdownMenuItem
            key={stage.kind}
            disabled={stage.kind === card.stage.kind}
            onClick={() => onMove({ kind: stage.kind })}
          >
            {stage.columnTitle}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRequestClose}>
          Close job
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
