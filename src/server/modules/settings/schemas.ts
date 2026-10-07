import { z } from "zod";
import {
  NEW_PER_DAY_MAX,
  RETENTION_MAX,
  RETENTION_MIN,
  REVIEWS_PER_DAY_MAX,
} from "@/server/modules/flashcards/domain/limits";
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "@/server/modules/progress/domain/limits";

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
  desiredRetention: z
    .number()
    .min(RETENTION_MIN, `Choose at least ${RETENTION_MIN * 100}%`)
    .max(RETENTION_MAX, `Choose at most ${RETENTION_MAX * 100}%`)
    .optional(),
  newCardsPerDay: z
    .number()
    .int()
    .min(0, "Choose 0 or more")
    .max(NEW_PER_DAY_MAX, `Choose ${NEW_PER_DAY_MAX} or fewer`)
    .optional(),
  reviewsPerDay: z
    .number()
    .int()
    .min(0, "Choose 0 or more")
    .max(REVIEWS_PER_DAY_MAX, `Choose ${REVIEWS_PER_DAY_MAX.toLocaleString("en-GB")} or fewer`)
    .optional(),
  dailyGoalMinutes: z
    .number()
    .int("Choose a whole number of minutes")
    .min(DAILY_GOAL_MIN, `Choose at least ${DAILY_GOAL_MIN} minutes`)
    .max(DAILY_GOAL_MAX, `Choose ${DAILY_GOAL_MAX} minutes or fewer`)
    .optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Keep it under 80 characters"),
});
