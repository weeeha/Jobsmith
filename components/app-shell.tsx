"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { AppSidebar } from "@/components/super-ai/app-sidebar";
import { SidebarNav } from "@/components/super-ai/sidebar-nav";
import { AppTopbar } from "@/components/super-ai/app-topbar";
import { AccountMenu } from "@/components/super-ai/account-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "board", label: "Board", href: "/board" },
  { id: "settings", label: "Settings", href: "/settings" },
];

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
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.href === pathname ? "page" : undefined}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover aria-[current=page]:bg-secondary aria-[current=page]:text-text-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </SidebarProvider>
  );
}
