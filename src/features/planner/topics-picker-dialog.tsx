"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "@/features/knowledge/use-action";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { setDeadlineTopics } from "@/server/actions/planner";

/**
 * Chooses the topics an exam covers: the whole subject (including topics
 * added later), or a selection of its topics.
 */
export function TopicsPickerDialog({
  open,
  onOpenChange,
  deadlineId,
  groups,
  coversWholeSubject,
  selected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deadlineId: string;
  groups: TopicGroup[];
  coversWholeSubject: boolean;
  selected: string[];
}) {
  const { run, pending } = useAction();
  const [whole, setWhole] = useState(coversWholeSubject);
  const [picked, setPicked] = useState(() => new Set(selected));

  useEffect(() => {
    if (!open) return;
    // Start from what is saved each time the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhole(coversWholeSubject);
    setPicked(new Set(selected));
  }, [open, coversWholeSubject, selected]);

  const all = groups.flatMap((g) => g.topics.map((t) => t.id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    // Every topic ticked is the same as the whole subject, but keeps covering topics added later.
    const topicIds = whole || picked.size === all.length ? [] : all.filter((id) => picked.has(id));
    const ok = await run(() => setDeadlineTopics({ id: deadlineId, topicIds }), { success: "Topics saved" });
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>Topics in this exam</DialogTitle>
          <DialogDescription>Leave out the topics that won&apos;t come up.</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">What the exam covers</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={whole}
              onChange={() => setWhole(true)}
              className="accent-primary"
            />
            Everything in the subject
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={!whole}
              onChange={() => {
                setWhole(false);
                if (picked.size === 0) setPicked(new Set(all));
              }}
              className="accent-primary"
            />
            Only some topics
          </label>
        </fieldset>
        <div className="-mx-1 overflow-y-auto px-1">
          {!whole && (
            <div className="grid gap-4 border-t pt-4">
              {groups
                .filter((g) => g.topics.length > 0)
                .map((g) => (
                  <fieldset key={g.label} className="grid gap-1">
                    <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                      {g.label}
                    </legend>
                    {g.topics.map((t) => (
                      <label
                        key={t.id}
                        className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(t.id)}
                          onChange={() => toggle(t.id)}
                          className="accent-primary size-4"
                        />
                        {t.name}
                      </label>
                    ))}
                  </fieldset>
                ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} disabled={!whole && picked.size === 0}>
            Save topics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
