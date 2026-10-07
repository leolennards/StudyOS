"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Tabs across a subject's pages, styled like the subject list's filter. */
export function SubjectTabs({
  subjectId,
  noteCount,
  documentCount,
  cardCount,
  paperCount,
}: {
  subjectId: string;
  noteCount: number;
  documentCount: number;
  cardCount: number;
  paperCount: number;
}) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On a narrow screen the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    nav.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  const base = `/subjects/${subjectId}`;
  const tabs = [
    { href: base, label: "Structure", current: pathname === base },
    {
      href: `${base}/notes`,
      label: "Notes",
      count: noteCount,
      current: pathname.startsWith(`${base}/notes`),
    },
    {
      href: `${base}/documents`,
      label: "Documents",
      count: documentCount,
      current: pathname.startsWith(`${base}/documents`),
    },
    {
      href: `${base}/flashcards`,
      label: "Flashcards",
      count: cardCount,
      current: pathname.startsWith(`${base}/flashcards`),
    },
    {
      href: `${base}/papers`,
      label: "Past papers",
      count: paperCount,
      current: pathname.startsWith(`${base}/papers`),
    },
  ];
  return (
    <nav ref={nav} aria-label="Subject sections" className="mt-8 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring/50 -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-[3px]",
            tab.current
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">{tab.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
