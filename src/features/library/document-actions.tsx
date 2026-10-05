"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, MoreHorizontal, Pencil, RotateCcw, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deleteDocument, getDocumentDownloadUrl, retryDocument } from "@/server/actions/library";
import type { DocumentKind } from "@/server/modules/library/domain/kind";
import type { DocumentStatus } from "@/server/modules/library/domain/status";
import { DocumentDetailsDialog, type DocumentDetails } from "./document-details-dialog";
import { DocumentTopicsDialog, type TopicsDialogState } from "./document-topics-dialog";
import type { TopicGroup } from "./types";

export type ActionsDocument = {
  id: string;
  subjectId: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  topicIds: string[];
};

/** The menu of things to do with one document, shared by the list and the document page. */
export function DocumentActions({
  doc,
  topicGroups,
  afterDelete,
  showEdit = false,
}: {
  doc: ActionsDocument;
  topicGroups: TopicGroup[];
  /** Where to go once deleted; stays on the page when not set. */
  afterDelete?: string;
  /** Show Edit as its own button, as on the document page. */
  showEdit?: boolean;
}) {
  const router = useRouter();
  const { run } = useAction();
  const [details, setDetails] = useState<DocumentDetails | null>(null);
  const [topics, setTopics] = useState<TopicsDialogState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const edit = () => setDetails({ id: doc.id, title: doc.title, kind: doc.kind });

  async function download() {
    const url = await run(() => getDocumentDownloadUrl({ id: doc.id }));
    if (url) window.location.assign(url);
  }

  return (
    <>
      {showEdit && (
        <Button variant="outline" onClick={edit}>
          <Pencil aria-hidden />
          Edit
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={showEdit ? "outline" : "ghost"}
            size={showEdit ? "icon" : "icon-sm"}
            aria-label={`More actions for ${doc.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!showEdit && (
            <DropdownMenuItem onSelect={edit}>
              <Pencil aria-hidden />
              Edit details
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setTopics({ id: doc.id, title: doc.title, topicIds: doc.topicIds })}>
            <Tags aria-hidden />
            Link topics
          </DropdownMenuItem>
          {doc.status !== "pending_upload" && (
            <DropdownMenuItem onSelect={download}>
              <Download aria-hidden />
              Download original
            </DropdownMenuItem>
          )}
          {doc.status === "failed" && (
            <DropdownMenuItem
              onSelect={() =>
                run(() => retryDocument({ id: doc.id }), { success: "Trying again" }).then(() => router.refresh())
              }
            >
              <RotateCcw aria-hidden />
              Try again
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              setConfirm({
                title: `Delete ${doc.title}?`,
                description: "This permanently deletes the file and the text read from it. It can't be undone.",
                confirmLabel: "Delete document",
                onConfirm: async () => {
                  const ok = await run(() => deleteDocument({ id: doc.id }), { success: "Document deleted" });
                  if (ok && afterDelete) router.replace(afterDelete);
                },
              })
            }
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DocumentDetailsDialog doc={details} onClose={() => setDetails(null)} />
      <DocumentTopicsDialog
        subjectId={doc.subjectId}
        groups={topicGroups}
        state={topics}
        onClose={() => setTopics(null)}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
