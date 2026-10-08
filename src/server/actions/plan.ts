"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/server/lib/action";
import { studyPlanService } from "@/server/modules/planner/plan-service";
import { movePlanItemSchema, saveWeekSchema, setPlanItemStatusSchema } from "@/server/modules/planner/schemas";

/** Thin transport layer for study plans: validation, auth and error mapping live in `action()`. */

const refresh = () => {
  revalidatePath("/plan");
  revalidatePath("/today");
};

export const saveStudyWeek = action(saveWeekSchema, async (ctx, input) => {
  const result = await studyPlanService.saveWeek(ctx, input);
  refresh();
  return result;
});

export const makeStudyPlan = action(z.object({}), async (ctx) => {
  const result = await studyPlanService.makePlan(ctx);
  refresh();
  return result;
});

export const setPlanItemStatus = action(setPlanItemStatusSchema, async (ctx, input) => {
  const result = await studyPlanService.setItemStatus(ctx, input);
  refresh();
  return result;
});

export const movePlanItem = action(movePlanItemSchema, async (ctx, input) => {
  const result = await studyPlanService.moveItem(ctx, input);
  refresh();
  return result;
});
