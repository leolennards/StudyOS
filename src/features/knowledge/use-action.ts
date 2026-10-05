"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/lib/result";

/**
 * Runs a Server Action with a pending state and shows a toast when it fails.
 * Returns the data on success, or null on failure.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    opts?: { success?: string; onError?: (r: Extract<ActionResult<T>, { ok: false }>) => void },
  ) {
    return new Promise<T | null>((resolve) => {
      startTransition(async () => {
        try {
          const result = await fn();
          if (result.ok) {
            if (opts?.success) toast.success(opts.success);
            resolve(result.data);
          } else {
            if (opts?.onError) opts.onError(result);
            else toast.error(result.error.message);
            resolve(null);
          }
        } catch {
          toast.error("We couldn't reach StudyOS. Check your connection and try again.");
          resolve(null);
        }
      });
    });
  }
  return { pending, run };
}
