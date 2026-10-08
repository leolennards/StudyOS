"use client";

import Link from "next/link";
import { Check, CircleHelp, MoreHorizontal, Timer, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { movePlanItem, setPlanItemStatus } from "@/server/actions/plan";
import { formatMinutes } from "@/server/modules/planner/domain/plan";
import type { PlanItem } from "@/server/modules/planner/plan-service";
import { dayLabel, itemDetail, itemHref, itemTitle } from "./format";

/**
 * One block of the plan: a box to tick it off, what to do and why, how
 * long it should take, and a menu to move it to another day or skip it.
 */
export function PlanItemRow({ item, today, days }: { item: PlanItem; today: string; days: string[] }) {
  const { run, pending } = useAction();
  const title = itemTitle(item);
  const done = item.status === "done";
  const skipped = item.status === "skipped";
  const setStatus = (status: PlanItem["status"]) => run(() => setPlanItemStatus({ id: item.id, status }));

  return (
    <li className={cn("flex items-start gap-3 py-2.5", pending && "opacity-60")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Done: ${title}`}
        disabled={pending || skipped}
        onClick={() => setStatus(done ? "todo" : "done")}
        className={cn(
          "focus-visible:ring-ring/50 mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed",
          done
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/50 hover:border-primary",
        )}
      >
        {done && <Check className="size-3.5" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={itemHref(item)}
          className={cn(
            "block truncate font-medium underline-offset-4 hover:underline",
            (done || skipped) && "text-muted-foreground line-through",
          )}
        >
          {title}
        </Link>
        <p className="text-muted-foreground mt-0.5 flex min-w-0 items-baseline gap-1.5 text-sm">
          {item.subject && <SubjectDot colour={item.subject.colour} className="translate-y-px" />}
          <span>{itemDetail(item)}</span>
        </p>
      </div>

      <span className="text-muted-foreground mt-0.5 shrink-0 text-sm tabular-nums">
        {skipped ? "Skipped" : formatMinutes(item.minutes)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="-my-1 shrink-0" aria-label={`More for ${title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {item.kind === "topic" && item.subject && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/focus?subject=${item.subject.id}`}>
                  <Timer aria-hidden />
                  Start a focus session
                </Link>
              </DropdownMenuItem>
              {item.topic && item.topic.cards > 0 && (
                <DropdownMenuItem asChild>
                  <Link href={`/quiz?topic=${item.topic.id}`}>
                    <CircleHelp aria-hidden />
                    Quiz on it
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {!done && days.some((d) => d !== item.day) && (
            <>
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Move to</DropdownMenuLabel>
              {days
                .filter((d) => d !== item.day)
                .map((d) => (
                  <DropdownMenuItem key={d} onSelect={() => run(() => movePlanItem({ id: item.id, day: d }))}>
                    {dayLabel(d, today)}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
            </>
          )}
          {skipped ? (
            <DropdownMenuItem onSelect={() => setStatus("todo")}>
              <Undo2 aria-hidden />
              Put it back
            </DropdownMenuItem>
          ) : (
            !done && (
              <DropdownMenuItem onSelect={() => setStatus("skipped")}>
                <X aria-hidden />
                Skip it
              </DropdownMenuItem>
            )
          )}
          {done && (
            <DropdownMenuItem onSelect={() => setStatus("todo")}>
              <Undo2 aria-hidden />
              Not done yet
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
