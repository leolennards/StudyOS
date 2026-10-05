/**
 * The shape every format is turned into (Architecture §9, the internal
 * representation): pages, each with its plain text and, where the format
 * records it, its structure. Everything downstream (viewer, search, the
 * tutor's citations) works on this one shape.
 */
export type Block = { type: "heading" | "paragraph" | "list_item" | "note"; text: string; level?: number };

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  blocks: Block[] | null;
  ocrUsed: boolean;
  ocrConfidence: number | null;
};

/**
 * A failure the student can act on ("this PDF is password-protected"),
 * as opposed to an unexpected error. Permanent failures are not retried.
 */
export class ProcessingError extends Error {
  readonly permanent: boolean;
  constructor(userMessage: string, opts: { permanent?: boolean; cause?: unknown } = {}) {
    super(userMessage, { cause: opts.cause });
    this.name = "ProcessingError";
    this.permanent = opts.permanent ?? true;
  }
}

export const blocksToText = (blocks: Block[]) => blocks.map((b) => b.text).join("\n\n");
