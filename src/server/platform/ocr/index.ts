import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Optical character recognition behind an interface (Architecture §10), so a
 * managed document-OCR service chosen by the bake-off can replace or sit in
 * front of the built-in engine without touching the pipeline.
 *
 * The built-in engine is Tesseract (via tesseract.js) with the English model
 * bundled from npm, so it works offline and needs no API key. It is good on
 * printed text and weak on handwriting and mathematics.
 */
export type OcrResult = { text: string; confidence: number };

export interface OcrEngine {
  readonly name: string;
  recognise(image: Buffer): Promise<OcrResult>;
  close(): Promise<void>;
}

class TesseractEngine implements OcrEngine {
  readonly name = "tesseract";
  #worker: Promise<Worker> | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  #getWorker() {
    this.#worker ??= (async () => {
      const require = createRequire(import.meta.url);
      const dataDir = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));
      return createWorker("eng", 1, {
        langPath: path.join(dataDir, "4.0.0_best_int"),
        cachePath: path.join(tmpdir(), "studyos-tesseract"),
        gzip: true,
      });
    })();
    return this.#worker;
  }

  /** One page at a time per process: Tesseract is CPU-bound and a queue keeps memory flat. */
  recognise(image: Buffer): Promise<OcrResult> {
    const run = this.#queue.then(async () => {
      const worker = await this.#getWorker();
      const { data } = await worker.recognize(image);
      return { text: data.text, confidence: data.confidence };
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  async close() {
    const worker = await this.#worker?.catch(() => undefined);
    this.#worker = undefined;
    await worker?.terminate();
  }
}

const globalForOcr = globalThis as unknown as { studyosOcr?: OcrEngine };

export function getOcr(): OcrEngine {
  globalForOcr.studyosOcr ??= new TesseractEngine();
  return globalForOcr.studyosOcr;
}

export async function closeOcr() {
  await globalForOcr.studyosOcr?.close();
  globalForOcr.studyosOcr = undefined;
}
