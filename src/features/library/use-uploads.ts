"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmUpload, createUpload } from "@/server/actions/library";
import { MAX_FILES_PER_UPLOAD } from "@/server/modules/library/domain/limits";

export type UploadItem = {
  key: string;
  name: string;
  size: number;
  state: "hashing" | "uploading" | "confirming" | "done" | "error";
  /** 0–100 while uploading. */
  progress: number;
  error?: string;
};

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUTs the file to the signed URL, reporting progress. fetch() cannot report upload progress, XHR can. */
function put(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/**
 * The browser side of an upload (Architecture §8): checksum the file, ask the
 * server for a signed URL, send the file straight to storage, then confirm.
 * Files go one at a time so a slow connection is not split many ways.
 */
export function useUploads(subjectId: string) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const start = useCallback(
    async (files: File[]) => {
      const accepted = files.slice(0, MAX_FILES_PER_UPLOAD);
      const batch = accepted.map((file) => ({
        file,
        item: {
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          state: "hashing" as const,
          progress: 0,
        },
      }));
      setItems((list) => [...list.filter((i) => i.state !== "done"), ...batch.map((b) => b.item)]);
      if (files.length > accepted.length) {
        setItems((list) => [
          ...list,
          {
            key: `limit-${Date.now()}`,
            name: `${files.length - accepted.length} more file(s)`,
            size: 0,
            state: "error",
            progress: 0,
            error: `Upload up to ${MAX_FILES_PER_UPLOAD} files at a time.`,
          },
        ]);
      }

      for (const { file, item } of batch) {
        try {
          if (file.size === 0) throw new Error("That file is empty.");
          const sha256 = await sha256Hex(file);
          const created = await createUpload({ subjectId, filename: file.name, size: file.size, sha256 });
          if (!created.ok) throw new Error(created.error.message);
          update(item.key, { state: "uploading" });
          await put(created.data.upload.url, created.data.upload.headers, file, (progress) =>
            update(item.key, { progress }),
          ).catch(() => {
            throw new Error("The upload was interrupted. Check your connection and try again.");
          });
          update(item.key, { state: "confirming", progress: 100 });
          const confirmed = await confirmUpload({ id: created.data.id });
          if (!confirmed.ok) throw new Error(confirmed.error.message);
          update(item.key, { state: "done" });
          router.refresh();
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : "That file couldn't be uploaded. Try again.";
          update(item.key, { state: "error", error: message });
        }
      }
    },
    [subjectId, router],
  );

  const dismiss = (key: string) => setItems((list) => list.filter((i) => i.key !== key));

  return { items, start, dismiss, busy: items.some((i) => i.state !== "done" && i.state !== "error") };
}
