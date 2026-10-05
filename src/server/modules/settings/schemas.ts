import { z } from "zod";

export const THEMES = ["system", "light", "dark"] as const;

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const updateSettingsSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone").optional(),
  theme: z.enum(THEMES).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Keep it under 80 characters"),
});
