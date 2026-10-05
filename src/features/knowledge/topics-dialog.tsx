"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/server/lib/result";
import type { TopicGroup } from "./topic-groups";
import { useAction } from "./use-action";

export type TopicsDialogState = { id: string; title: string; topicIds: string[] };

type Props = {
  subjectId: string;
  groups: TopicGroup[];
  state: TopicsDialogState | null;
  /** Says what linking topics is for, under the title. */
  description: string;
  save: (input: { id: string; topicIds: string[] }) => Promise<ActionResult<unknown>>;
  onClose: () => void;
};

/** Choose which of the subject's topics a document or a note covers. */
export function TopicsDialog({ state, ...props }: Props) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>{state && <TopicsForm key={state.id} state={state} {...props} />}</DialogContent>
    </Dialog>
  );
}

function TopicsForm({
  subjectId,
  groups,
  state,
  description,
  save: saveTopics,
  onClose,
}: Omit<Props, "state"> & { state: TopicsDialogState }) {
  const { run, pending } = useAction();
  const [selected, setSelected] = useState(() => new Set(state.topicIds));
  const hasTopics = groups.some((g) => g.topics.length > 0);

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function save() {
    const ok = await run(() => saveTopics({ id: state.id, topicIds: [...selected] }), {
      success: "Topics updated",
    });
    if (ok) onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Topics in {state.title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {hasTopics ? (
        <div className="grid max-h-80 gap-4 overflow-y-auto pr-1">
          {groups
            .filter((g) => g.topics.length > 0)
            .map((group) => (
              <fieldset key={group.label} className="grid gap-1">
                <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {group.label}
                </legend>
                {group.topics.map((t) => (
                  <label
                    key={t.id}
                    className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={selected.has(t.id)}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                    />
                    {t.name}
                  </label>
                ))}
              </fieldset>
            ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          This subject has no topics yet.{" "}
          <Link href={`/subjects/${subjectId}`} className="text-primary underline-offset-4 hover:underline">
            Add topics in Structure
          </Link>
          , then link them here.
        </p>
      )}
      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {hasTopics && (
          <Button onClick={save} loading={pending}>
            Save topics
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
