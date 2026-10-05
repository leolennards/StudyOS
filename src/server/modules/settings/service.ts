import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { getDb } from "@/server/platform/db/client";
import { accounts, userSettings } from "@/server/platform/db/schema";
import {
  DEFAULT_NEW_PER_DAY,
  DEFAULT_RETENTION,
  DEFAULT_REVIEWS_PER_DAY,
} from "@/server/modules/flashcards/domain/limits";
import type { updateSettingsSchema } from "./schemas";

export type UserSettings = {
  timezone: string;
  theme: "system" | "light" | "dark";
  /** Flashcard review (Architecture §21). */
  desiredRetention: number;
  newCardsPerDay: number;
  reviewsPerDay: number;
};

const DEFAULTS: UserSettings = {
  timezone: "UTC",
  theme: "system",
  desiredRetention: DEFAULT_RETENTION,
  newCardsPerDay: DEFAULT_NEW_PER_DAY,
  reviewsPerDay: DEFAULT_REVIEWS_PER_DAY,
};

/** Per-user preferences. Rows are created lazily on first write. */
export const settingsService = {
  async get(ctx: RequestContext): Promise<UserSettings> {
    const [row] = await getDb().select().from(userSettings).where(eq(userSettings.userId, ctx.userId)).limit(1);
    return row
      ? {
          timezone: row.timezone,
          theme: row.theme,
          desiredRetention: row.desiredRetention,
          newCardsPerDay: row.newCardsPerDay,
          reviewsPerDay: row.reviewsPerDay,
        }
      : DEFAULTS;
  },

  /** Whether the user signs in with a password (not only Google/Microsoft). */
  async hasPassword(ctx: RequestContext): Promise<boolean> {
    const rows = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, ctx.userId), eq(accounts.providerId, "credential")))
      .limit(1);
    return rows.length > 0;
  },

  async update(ctx: RequestContext, input: z.output<typeof updateSettingsSchema>) {
    const values = { ...(await this.get(ctx)), ...input };
    await getDb()
      .insert(userSettings)
      .values({ userId: ctx.userId, ...values })
      .onConflictDoUpdate({ target: userSettings.userId, set: { ...input, updatedAt: new Date() } });
    return values;
  },
};
