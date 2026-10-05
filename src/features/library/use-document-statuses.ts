"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocumentStatuses } from "@/server/actions/library";
import { type DocumentStatus, isSettled } from "@/server/modules/library/domain/status";

type Status = {
  status: DocumentStatus;
  stage: string | null;
  progress: number;
  errorMessage: string | null;
  pageCount: number | null;
};

const POLL_MS = 2000;

/**
 * Live processing status for documents that are still being processed
 * (Architecture §33: the worker writes status, the UI polls). When one
 * settles, the page is refreshed so its counts and links update too.
 */
export function useDocumentStatuses(docs: ({ id: string } & Status)[]) {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, Status>>({});
  const pending = docs.filter((d) => !isSettled((live[d.id] ?? d).status)).map((d) => d.id);
  const key = pending.join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let cancelled = false;
    const timer = setInterval(async () => {
      const result = await getDocumentStatuses({ ids }).catch(() => null);
      if (cancelled || !result?.ok) return;
      setLive((prev) => ({ ...prev, ...Object.fromEntries(result.data.map((s) => [s.id, s])) }));
      if (result.data.some((s) => isSettled(s.status))) router.refresh();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, router]);

  return (id: string, fallback: Status): Status => {
    const l = live[id];
    // A fresher server render wins over an older poll.
    if (!l || (isSettled(fallback.status) && !isSettled(l.status))) return fallback;
    return l;
  };
}
