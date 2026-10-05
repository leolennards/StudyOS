import { sql } from "drizzle-orm";
import { check, doublePrecision, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const themePreference = pgEnum("theme_preference", ["system", "light", "dark"]);

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    theme: themePreference("theme").notNull().default("system"),
    /** Flashcard review (Architecture §21): the recall probability FSRS aims for, and daily limits. */
    desiredRetention: doublePrecision("desired_retention").notNull().default(0.9),
    newCardsPerDay: integer("new_cards_per_day").notNull().default(20),
    reviewsPerDay: integer("reviews_per_day").notNull().default(200),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("user_settings_retention_range", sql`${t.desiredRetention} >= 0.7 and ${t.desiredRetention} <= 0.97`),
    check("user_settings_new_cards_range", sql`${t.newCardsPerDay} >= 0 and ${t.newCardsPerDay} <= 500`),
    check("user_settings_reviews_range", sql`${t.reviewsPerDay} >= 0 and ${t.reviewsPerDay} <= 9999`),
  ],
);
