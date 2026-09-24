"use client";

import { useRouter } from "next/navigation";

import { DetailTabs, type DetailTabItem } from "@/components/super-ai/detail-tabs";

export type JobTabId = "overview" | "research" | "people" | "timeline" | "prep";

// No `count` on any of these: the fixed copy for these tabs carries no
// badge count, and DetailTabs's `count` is optional.
const TAB_ITEMS: DetailTabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "people", label: "People" },
  { id: "timeline", label: "Timeline" },
  { id: "prep", label: "Prep" },
];

export function JobTabs({ activeTab, basePath }: { activeTab: JobTabId; basePath: string }) {
  const router = useRouter();

  return (
    <DetailTabs
      items={TAB_ITEMS}
      activeId={activeTab}
      onSelect={(id) => router.push(`${basePath}?tab=${id}`, { scroll: false })}
      ariaLabel="Job sections"
      // Five tabs do not fit one row at 390px; DetailTabs has no overflow
      // handling of its own, so wrapping to a second row is what keeps
      // every tab reachable without horizontal scrolling, rather than the
      // tab strip forcing the whole page wider than the viewport.
      className="flex-wrap"
    />
  );
}
