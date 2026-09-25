"use client";

import { useRouter } from "next/navigation";

import { DetailTabs, type DetailTabItem } from "@/components/super-ai/detail-tabs";

export type JobTabId = "overview" | "research" | "people" | "documents" | "timeline" | "prep";

const TAB_ITEMS: DetailTabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "people", label: "People" },
  { id: "documents", label: "Documents" },
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
      className="flex-wrap"
    />
  );
}
