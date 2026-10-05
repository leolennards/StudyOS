import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "@/server/platform/observability/logger";

/**
 * Converts Word and PowerPoint files to PDF with headless LibreOffice
 * (Architecture §9 stage 2), so the viewer can show them as the student
 * made them. Each conversion runs in a fresh temporary directory with its
 * own throwaway profile and a hard timeout, and the directory is removed
 * afterwards whatever happens (Architecture §39, conversion sandbox).
 */
const TIMEOUT_MS = 120_000;

function findOnPath(binary: string) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, binary);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

let resolved: string | null | undefined;

/** The LibreOffice binary, or null when it is not installed. */
export function libreOfficePath(configured?: string): string | null {
  if (configured) return configured;
  if (resolved === undefined) resolved = findOnPath("soffice") ?? findOnPath("libreoffice");
  return resolved;
}

let queue: Promise<unknown> = Promise.resolve();

/** Converts one file to PDF. Conversions run one at a time per process; LibreOffice is memory-hungry. */
export function convertToPdf(binary: string, input: Buffer, extension: "docx" | "pptx"): Promise<Buffer> {
  const run = queue.then(() => convert(binary, input, extension));
  queue = run.catch(() => {});
  return run;
}

async function convert(binary: string, input: Buffer, extension: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "studyos-convert-"));
  try {
    const source = path.join(dir, `input.${extension}`);
    await writeFile(source, input);
    const args = [
      `-env:UserInstallation=${pathToFileURL(path.join(dir, "profile")).href}`,
      "--headless",
      "--norestore",
      "--nologo",
      "--nolockcheck",
      "--nodefault",
      "--convert-to",
      "pdf",
      "--outdir",
      dir,
      source,
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: dir,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, HOME: dir },
      });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("LibreOffice timed out"));
      }, TIMEOUT_MS);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          logger.warn({ code, stderr }, "LibreOffice conversion failed");
          reject(new Error(`LibreOffice exited with code ${code}`));
        }
      });
    });
    return await readFile(path.join(dir, "input.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
