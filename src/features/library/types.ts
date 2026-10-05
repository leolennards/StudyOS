import type { DocumentFormat } from "@/server/modules/library/domain/formats";
import type { DocumentKind } from "@/server/modules/library/domain/kind";
import type { DocumentStatus } from "@/server/modules/library/domain/status";

/** Serializable document shape passed from the pages (server) to the library's client components. */
export type DocumentListItem = {
  id: string;
  subjectId: string;
  title: string;
  originalFilename: string;
  kind: DocumentKind;
  format: DocumentFormat;
  sizeBytes: number;
  status: DocumentStatus;
  stage: string | null;
  progress: number;
  errorMessage: string | null;
  pageCount: number | null;
  ocrPageCount: number;
  createdAt: string;
  topics: { id: string; name: string }[];
};

export type { TopicGroup } from "@/features/knowledge/topic-groups";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
