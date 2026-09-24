"use client";

import { useRouter } from "next/navigation";

import { DetailTabs, type DetailTabItem } from "@/components/super-ai/detail-tabs";

export type JobTabId = "overview" | "people" | "timeline";

// No `count` on any of these: the frame's fixed copy for these three tabs
// carries no badge count, and DetailTabs's `count` is optional.
const TAB_ITEMS: DetailTabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "timeline", label: "Timeline" },
];

export function JobTabs({ activeTab, basePath }: { activeTab: JobTabId; basePath: string }) {
  const router = useRouter();

  return (
    <DetailTabs
      items={TAB_ITEMS}
      activeId={activeTab}
      onSelect={(id) => router.push(`${basePath}?tab=${id}`, { scroll: false })}
      ariaLabel="Job sections"
    />
  );
}
