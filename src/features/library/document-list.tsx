"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS } from "@/server/modules/library/domain/kind";
import { DocumentActions } from "./document-actions";
import { DocumentStatusLine } from "./document-status";
import { FormatIcon } from "./format-icon";
import { formatBytes, type DocumentListItem, type TopicGroup } from "./types";
import { useDocumentStatuses } from "./use-document-statuses";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A subject's documents, with live status for any still being processed. */
export function DocumentList({ docs, topicGroups }: { docs: DocumentListItem[]; topicGroups: TopicGroup[] }) {
  const statusOf = useDocumentStatuses(docs);

  return (
    <ul aria-label="Documents" className="bg-card divide-y overflow-hidden rounded-xl border">
      {docs.map((doc) => {
        const s = statusOf(doc.id, doc);
        const ready = s.status === "ready";
        return (
          <li key={doc.id} className="flex items-start gap-3 p-3 sm:p-4">
            <FormatIcon format={doc.format} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {ready ? (
                  <Link
                    href={`/subjects/${doc.subjectId}/documents/${doc.id}`}
                    className="hover:text-primary focus-visible:ring-ring/50 truncate rounded-sm font-medium outline-none focus-visible:ring-[3px]"
                  >
                    {doc.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{doc.title}</span>
                )}
                <Badge variant="secondary">{KIND_LABELS[doc.kind]}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <DocumentStatusLine {...s} ocrPageCount={doc.ocrPageCount} />
                {s.status !== "failed" && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                    <span aria-hidden className="hidden sm:inline">
                      ·
                    </span>
                    <span className="hidden sm:inline">{dateFormat.format(new Date(doc.createdAt))}</span>
                  </>
                )}
              </p>
              {doc.topics.length > 0 && (
                <ul aria-label="Topics" className="mt-2 flex flex-wrap gap-1">
                  {doc.topics.map((t) => (
                    <li key={t.id}>
                      <Badge variant="outline">{t.name}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DocumentActions
              doc={{ ...doc, status: s.status, topicIds: doc.topics.map((t) => t.id) }}
              topicGroups={topicGroups}
            />
          </li>
        );
      })}
    </ul>
  );
}
