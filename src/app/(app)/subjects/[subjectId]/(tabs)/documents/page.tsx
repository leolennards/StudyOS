import { FileText } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentList } from "@/features/library/document-list";
import { DocumentUploader } from "@/features/library/document-uploader";
import { topicGroups } from "@/features/library/topic-groups";
import { formatBytes } from "@/features/library/types";
import { env } from "@/server/lib/env";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";

/** A subject's documents: upload, the list, and each one's processing status. */
export default async function SubjectDocumentsPage({ params }: PageProps<"/subjects/[subjectId]/documents">) {
  const { subjectId } = await params;
  const { ctx } = await requirePageSession();
  const [docs, tree, usage] = await Promise.all([
    libraryService.listDocuments(ctx, subjectId),
    knowledgeService.getSubjectTree(ctx, subjectId),
    libraryService.storageUsage(ctx),
  ]);
  const groups = topicGroups(tree.sections, tree.unsectioned);

  return (
    <div className="grid gap-6">
      <DocumentUploader subjectId={subjectId} maxMb={env().UPLOAD_MAX_MB} />
      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          description="Upload lecture slides, notes, textbook chapters or past papers. StudyOS reads the text from each one, including scanned pages."
        />
      ) : (
        <DocumentList docs={docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))} topicGroups={groups} />
      )}
      <p className="text-muted-foreground text-xs">
        {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} storage used
      </p>
    </div>
  );
}
