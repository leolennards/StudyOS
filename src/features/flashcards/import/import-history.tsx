"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deleteImport } from "@/server/actions/flashcards";
import { IMPORT_SOURCE_LABELS, type ImportSource } from "@/server/modules/flashcards/domain/import";

export type ImportListItem = {
  id: string;
  source: ImportSource;
  name: string;
  /** "7 Oct 2026", formatted on the server. */
  date: string;
  cards: number;
  reviewed: number;
};

const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

/** A subject's earlier imports, each of which can be taken back with its cards. */
export function ImportHistory({ imports }: { imports: ImportListItem[] }) {
  const router = useRouter();
  const { run } = useAction();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const ask = (item: ImportListItem) =>
    setConfirm({
      title: `Delete the ${plural(item.cards, "card")} from ${item.name}?`,
      description:
        item.reviewed > 0
          ? `You've reviewed ${item.reviewed.toLocaleString("en-GB")} of them, and that review history will be deleted too. Cards you added yourself aren't touched.`
          : "None of them have been reviewed yet. Cards you added yourself aren't touched.",
      confirmLabel: `Delete ${plural(item.cards, "card")}`,
      onConfirm: async () => {
        const ok = await run(() => deleteImport({ id: item.id }), { success: "Imported cards deleted" });
        if (ok) router.refresh();
      },
    });

  return (
    <>
      <ul aria-label="Earlier imports" className="-mx-2 grid gap-0.5">
        {imports.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="text-muted-foreground text-xs">
                {IMPORT_SOURCE_LABELS[item.source]} · {item.date} · {plural(item.cards, "card")}
                {item.reviewed > 0 && `, ${item.reviewed.toLocaleString("en-GB")} reviewed`}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete the cards from ${item.name}`}
              onClick={() => ask(item)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
