"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Replaced by Sentry in Phase 11; the server already logs the real cause.
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60dvh] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground mt-2">
          This one is on us. Try again, and if it keeps happening the error reference is below.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
        </div>
        {error.digest && <p className="text-muted-foreground mt-6 font-mono text-xs">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
