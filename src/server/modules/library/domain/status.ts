/** Stages of the processing pipeline (Architecture §9), with the wording the student sees. */
export const PROCESSING_STAGES = {
  queued: "Waiting to start",
  validating: "Checking the file",
  converting: "Preparing a preview",
  extracting: "Reading the text",
  recognising: "Recognising scanned pages",
  saving: "Saving",
} as const;
export type ProcessingStage = keyof typeof PROCESSING_STAGES;

export const DOCUMENT_STATUSES = ["pending_upload", "uploaded", "processing", "ready", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const isSettled = (status: DocumentStatus) => status === "ready" || status === "failed";

export function stageLabel(status: DocumentStatus, stage: string | null) {
  if (status === "pending_upload") return "Uploading";
  if (status === "uploaded") return PROCESSING_STAGES.queued;
  if (status === "processing") return PROCESSING_STAGES[stage as ProcessingStage] ?? "Processing";
  if (status === "failed") return "Couldn't be processed";
  return "Ready";
}
