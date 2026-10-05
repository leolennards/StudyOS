"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/** Applies the theme saved in the user's settings once per sign-in, across devices. */
export function ThemeSync({ theme }: { theme: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
