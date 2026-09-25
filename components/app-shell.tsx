"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { AppSidebar } from "@/components/super-ai/app-sidebar";
import { SidebarNav } from "@/components/super-ai/sidebar-nav";
import { AppTopbar } from "@/components/super-ai/app-topbar";
import { AccountMenu } from "@/components/super-ai/account-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "board", label: "Board", href: "/board" },
  { id: "companies", label: "Companies", href: "/companies" },
  { id: "library", label: "Library", href: "/library" },
  { id: "preferences", label: "Preferences", href: "/preferences" },
  { id: "settings", label: "Settings", href: "/settings" },
];

// The phone bottom bar only has room for four slots. The first three of the
// six nav items are common enough to keep their own slot; the rest sit
// behind the fourth slot's "More" sheet.
const PHONE_TAB_ITEMS = NAV_ITEMS.slice(0, 3);
const MORE_ITEMS = NAV_ITEMS.slice(3);

const PHONE_NAV_ITEM_CLASS =
  "rounded-md px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover aria-[current=page]:bg-secondary aria-[current=page]:text-text-accent";

export function AppShell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeId = NAV_ITEMS.find((item) => item.href === pathname)?.id;
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const isMoreActive = MORE_ITEMS.some((item) => item.href === pathname);

  return (
    <SidebarProvider>
      <AppSidebar
        nav={
          <SidebarNav
            sections={[{ label: "Jobsmith", items: NAV_ITEMS }]}
            activeId={activeId}
          />
        }
        footer={
          <AccountMenu
            user={{ name: email, email }}
            theme={theme ?? "system"}
            onThemeChange={setTheme}
            onSignOut={onSignOut}
          />
        }
      />

      {/* min-w-0: SidebarInset is a row-direction flex item of the sidebar
          wrapper (components/ui/sidebar.tsx, vendored - not hand-edited).
          Flex items keep the default `min-width: auto`, which floors this
          item at its subtree's min-content width; wide, non-wrapping
          content further down (the board's own horizontally-scrolling
          section) then refuses to let SidebarInset shrink to the space the
          sidebar actually leaves it, so the whole page grows wider than the
          viewport and scrolls sideways instead of the board's own section
          scrolling internally. min-w-0 (min-width: 0) removes that floor.
          Confirmed empirically (scratch Playwright measurements): this is
          the one element in the ancestor chain from the board's scrolling
          section up to <body> where adding the constraint changes anything
          - the section itself, its app-shell wrapper div, and the sidebar
          wrapper each leave document.documentElement.scrollWidth unchanged
          when tried alone. */}
      <SidebarInset className="min-w-0">
        <AppTopbar context="document" title="Jobsmith" />
        {/* A div, not <main>: SidebarInset already renders the page's one
            <main> (data-slot="sidebar-inset"); a second <main> here would be
            a duplicate top-level landmark. */}
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </SidebarInset>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface-sidebar pt-2 pb-safe md:hidden"
      >
        {PHONE_TAB_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.href === pathname ? "page" : undefined}
            className={PHONE_NAV_ITEM_CLASS}
          >
            {item.label}
          </Link>
        ))}
        {/* A button, not a Link: it opens the sheet below rather than going
            anywhere itself, so it never carries aria-current="page" the way
            the three links above do. It still needs to look selected while
            one of the sheet's own pages is open, hence the same active
            classes applied directly here instead of through that attribute. */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(PHONE_NAV_ITEM_CLASS, isMoreActive && "bg-secondary text-text-accent")}
        >
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-current={item.href === pathname ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover aria-[current=page]:bg-secondary aria-[current=page]:text-text-accent"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
