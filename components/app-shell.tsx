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

      <SidebarInset>
        <AppTopbar context="document" title="Jobsmith" />
        {/* A div, not <main>: SidebarInset already renders the page's one
            <main> (data-slot="sidebar-inset"); a second <main> here would be
            a duplicate top-level landmark. */}
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </SidebarInset>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface-sidebar py-2 md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.href === pathname ? "page" : undefined}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </SidebarProvider>
  );
}
