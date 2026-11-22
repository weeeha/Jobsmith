"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Version = { version: number; label: string };
type Props = { versions: Version[]; a: number; b: number; hrefFor(a: number, b: number): string };

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function Selects({ versions, a, b, hrefFor, className }: Props & { className?: string }) {
  const router = useRouter();
  const id = React.useId();
  const options = versions.map((v) => (
    <option key={v.version} value={v.version}>
      {v.label}
    </option>
  ));
  return (
    <div className={className}>
      <label htmlFor={`${id}-a`} className="flex flex-col gap-1 text-sm text-muted-foreground">
        Older version
        <select
          id={`${id}-a`}
          className={SELECT_CLASS}
          value={a}
          onChange={(e) => router.push(hrefFor(Number(e.target.value), b))}
        >
          {options}
        </select>
      </label>
      <label htmlFor={`${id}-b`} className="flex flex-col gap-1 text-sm text-muted-foreground">
        Newer version
        <select
          id={`${id}-b`}
          className={SELECT_CLASS}
          value={b}
          onChange={(e) => router.push(hrefFor(a, Number(e.target.value)))}
        >
          {options}
        </select>
      </label>
    </div>
  );
}

export function VersionPicker(props: Props) {
  return (
    <>
      <Selects {...props} className="hidden items-end gap-3 lg:flex" />
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
            {`Versions ${props.a} and ${props.b}`}
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-safe">
            <SheetHeader>
              <SheetTitle>Versions</SheetTitle>
              <SheetDescription>Choose the two versions to compare.</SheetDescription>
            </SheetHeader>
            <Selects {...props} className="flex flex-col gap-3 px-4" />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
