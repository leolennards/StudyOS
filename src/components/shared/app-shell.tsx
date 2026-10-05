"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ChevronsUpDown,
  Library,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sunrise,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { CommandPalette, useCommandPaletteShortcut } from "@/features/search/command-palette";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeMenuItems } from "./theme-menu-items";

export type ShellSubject = { id: string; name: string; colour: string };
export type ShellUser = { name: string; email: string };

/**
 * The app shell (Architecture §1): a short, subject-centric global sidebar.
 * Collapsible to an icon rail on desktop; a drawer on mobile (03 UI/UX spec).
 * Review, Planner, Progress and Tutor are added as their phases are built.
 */
const NAV = [
  { href: "/today", label: "Today", icon: Sunrise },
  { href: "/subjects", label: "Subjects", icon: Library },
] as const;

const SIDEBAR_COOKIE = "sidebar_collapsed";

export function AppShell({
  user,
  subjects,
  initialCollapsed,
  children,
}: {
  user: ShellUser;
  subjects: ShellSubject[];
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useCommandPaletteShortcut(setSearchOpen);
  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        aria-label="Main"
        className={cn(
          "border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <SidebarContents
          user={user}
          subjects={subjects}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onSearch={openSearch}
        />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          {/* Any link inside closes the drawer, so the page is visible after navigating. */}
          <SidebarContents
            user={user}
            subjects={subjects}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
            onSearch={openSearch}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Link href="/today" aria-label="StudyOS home">
            <Logo />
          </Link>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={openSearch} aria-label="Search">
            <Search />
          </Button>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} subjects={subjects} />
    </div>
  );
}

function SidebarContents({
  user,
  subjects,
  collapsed,
  onToggle,
  onNavigate,
  onSearch,
}: {
  user: ShellUser;
  subjects: ShellSubject[];
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      className="flex h-full flex-col"
      onClick={onNavigate ? (e) => (e.target as HTMLElement).closest("a") && onNavigate() : undefined}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <Link
            href="/today"
            className="focus-visible:ring-ring/50 mr-auto rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <Logo />
          </Link>
        )}
        {onToggle && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="text-muted-foreground"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
      </div>

      <div className={cn("px-2 pt-1", collapsed && "flex justify-center")}>
        <SearchButton collapsed={collapsed} onClick={onSearch} />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Primary">
        <ul className="grid gap-0.5">
          {NAV.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                label={item.label}
                icon={<item.icon />}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>

        {!collapsed && (
          <div className="mt-6">
            <div className="flex items-center justify-between px-2 pb-1">
              <h2 className="text-muted-foreground text-xs font-medium">Your subjects</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground size-6" asChild>
                    <Link href="/subjects?new=1" aria-label="New subject">
                      <Plus />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">New subject</TooltipContent>
              </Tooltip>
            </div>
            {subjects.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1 text-sm">No subjects yet.</p>
            ) : (
              <ul className="grid gap-0.5">
                {subjects.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/subjects/${s.id}`}
                      aria-current={isActive(`/subjects/${s.id}`) ? "page" : undefined}
                      className={cn(
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]",
                        isActive(`/subjects/${s.id}`) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                      )}
                    >
                      <SubjectDot colour={s.colour} />
                      <span className="truncate">{s.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      <div className="border-sidebar-border border-t p-2">
        <NavLink
          href="/settings"
          label="Settings"
          icon={<Settings />}
          active={isActive("/settings")}
          collapsed={collapsed}
        />
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}

function SearchButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label="Search"
            className="text-muted-foreground"
          >
            <Search />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Search</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-sidebar-border bg-background/60 text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Search</span>
      <ShortcutHint />
    </button>
  );
}

/** "⌘K" on Apple devices, "Ctrl K" elsewhere; shown once mounted, as the server can't know which. */
const noSubscribe = () => () => {};

function ShortcutHint() {
  const mac = useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => null,
  );
  if (mac === null) return null;
  return (
    <kbd aria-hidden className="bg-muted rounded border px-1.5 font-sans text-[0.7rem]">
      {mac ? "⌘K" : "Ctrl K"}
    </kbd>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 flex h-9 items-center gap-2.5 rounded-md px-2 text-sm outline-none focus-visible:ring-[3px] [&_svg]:size-4 [&_svg]:shrink-0",
        active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        collapsed && "justify-center px-0",
      )}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function UserMenu({ user, collapsed }: { user: ShellUser; collapsed: boolean }) {
  const router = useRouter();
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "hover:bg-sidebar-accent focus-visible:ring-ring/50 mt-1 flex w-full items-center gap-2.5 rounded-md p-1.5 text-left text-sm outline-none focus-visible:ring-[3px]",
            collapsed && "justify-center",
          )}
          aria-label="Account menu"
        >
          <span className="bg-primary/15 text-primary grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
            {initials || "?"}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground block truncate text-xs">{user.email}</span>
              </span>
              <ChevronsUpDown className="text-muted-foreground size-4" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
