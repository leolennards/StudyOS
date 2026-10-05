"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useAction } from "@/features/knowledge/use-action";
import { updateSettings } from "@/server/actions/settings";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export function PreferencesForm({ timezone, theme }: { timezone: string; theme: "system" | "light" | "dark" }) {
  const { run, pending } = useAction();
  const { setTheme } = useTheme();
  const [tz, setTz] = useState(timezone);
  const [th, setTh] = useState(theme);
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(tz) ? list : [tz, ...list];
  }, [tz]);
  const deviceZone = typeof window === "undefined" ? null : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dirty = tz !== timezone || th !== theme;

  async function save() {
    const ok = await run(() => updateSettings({ timezone: tz, theme: th }), { success: "Preferences saved" });
    if (ok) setTheme(th);
  }

  return (
    <div className="grid max-w-md gap-4">
      <FormField id="pref-theme" label="Theme">
        <select className={selectClass} value={th} onChange={(e) => setTh(e.target.value as typeof th)}>
          <option value="system">Match my device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </FormField>
      <FormField
        id="pref-timezone"
        label="Time zone"
        hint={
          deviceZone && deviceZone !== tz ? (
            <button type="button" className="text-primary hover:underline" onClick={() => setTz(deviceZone)}>
              Use this device&apos;s time zone ({deviceZone})
            </button>
          ) : (
            "Used for your daily plan and reminders."
          )
        }
      >
        <select className={selectClass} value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </FormField>
      <div>
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}
