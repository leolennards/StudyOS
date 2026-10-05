"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { updateSettings } from "@/server/actions/settings";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Theme choice: applied instantly, then saved to the user's settings. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Theme</DropdownMenuLabel>
      {options.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem
          key={value}
          onSelect={(e) => {
            e.preventDefault();
            setTheme(value);
            void updateSettings({ theme: value });
          }}
          aria-checked={theme === value}
          role="menuitemradio"
        >
          <Icon aria-hidden />
          {label}
          {theme === value && <span className="bg-primary ml-auto size-1.5 rounded-full" aria-hidden />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
