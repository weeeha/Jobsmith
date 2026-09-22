"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import type { MoveTarget } from "@/lib/pipeline/rules";
import type { BoardCard } from "@/lib/db/scoped";

interface MoveSheetProps {
  card: BoardCard | null;
  onOpenChange: (open: boolean) => void;
  onMove: (target: MoveTarget) => void;
  onRequestClose: () => void;
}

/**
 * D8: the phone twin of move-menu.tsx's "Move to" dropdown - the same eight
 * actions (seven columns plus "Close job"), reached through a bottom Sheet
 * instead of a hover-oriented popover, which is a poor fit for touch. Calls
 * the identical onMove/onRequestClose callbacks a drop, the number keys and
 * MoveMenu all call on the desktop board, so every trigger across both
 * boards funnels into the same runMove/runClose implementation in whichever
 * board mounted it.
 *
 * No radio group and no destructive styling beyond what `Button
 * variant="ghost"` already gives every row: the reason for closing is still
 * collected afterward by CloseDialog, which onRequestClose opens - this
 * sheet never asks for one itself.
 *
 * Sheet's own default focus behavior applies unmodified: opening moves focus
 * into the popup's first row, and closing (Escape, the backdrop, or any
 * row's own onClick below, which calls onOpenChange(false)) returns focus to
 * whichever "Move to" button opened it.
 */
export function MoveSheet({ card, onOpenChange, onMove, onRequestClose }: MoveSheetProps) {
  return (
    <Sheet open={card !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Move to</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4 pb-4">
          {STAGE_KINDS.map((stage) => (
            <Button
              key={stage.kind}
              variant="ghost"
              className="justify-start"
              onClick={() => {
                onMove({ kind: stage.kind });
                onOpenChange(false);
              }}
            >
              {stage.columnTitle}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => {
              onRequestClose();
              onOpenChange(false);
            }}
          >
            Close job
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
