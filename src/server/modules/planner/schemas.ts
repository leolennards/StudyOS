import { z } from "zod";
import { CONFIDENCE_LEVELS, DEADLINE_KINDS, PLANNER_LIMITS } from "./domain/exams";
import { PLAN_ITEM_STATUSES, PLAN_LIMITS } from "./domain/plan";

/** Input schemas shared by the exam forms (client) and the actions (server). */

const id = z.uuid("That item isn't valid");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** A calendar date, "YYYY-MM-DD", that really exists. */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Pick a date");

/** A time of day, "HH:MM", or empty for none. */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const deadlineFields = {
  kind: z.enum(DEADLINE_KINDS),
  title: z
    .string()
    .trim()
    .min(1, "Give it a name")
    .max(PLANNER_LIMITS.title, `Keep it under ${PLANNER_LIMITS.title} characters`),
  subjectId: id.nullable(),
  dueOn: calendarDate,
  startsAt: timeOfDay,
  location: optionalText(PLANNER_LIMITS.location),
};

export const createDeadlineSchema = z.object(deadlineFields);
export const updateDeadlineSchema = z.object({ id, ...deadlineFields });
export const deleteDeadlineSchema = z.object({ id });

/** The topics an exam covers. An empty list means every topic in its subject. */
export const setDeadlineTopicsSchema = z.object({
  id,
  topicIds: z.array(id).max(PLANNER_LIMITS.topics),
});

/** A topic's confidence, or null to clear it. */
export const setTopicConfidenceSchema = z.object({
  topicId: id,
  level: z
    .union([z.literal(CONFIDENCE_LEVELS[0]), z.literal(CONFIDENCE_LEVELS[1]), z.literal(CONFIDENCE_LEVELS[2])])
    .nullable(),
});

/** Free minutes on each day of the week, Monday first. Accepts the form's strings. */
export const saveWeekSchema = z.object({
  weekMinutes: z
    .array(
      z.coerce
        .number({ error: "Enter a number of minutes" })
        .int("Use whole minutes")
        .min(0, "Can't be less than 0")
        .max(PLAN_LIMITS.minutesPerDay, "That's more than 12 hours"),
    )
    .length(7),
});

export const setPlanItemStatusSchema = z.object({ id, status: z.enum(PLAN_ITEM_STATUSES) });

export const movePlanItemSchema = z.object({ id, day: calendarDate });

export type DeadlineFormInput = z.input<typeof createDeadlineSchema>;
