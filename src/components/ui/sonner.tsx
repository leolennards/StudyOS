"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border !shadow-lg !rounded-lg",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster };
