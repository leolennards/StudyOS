"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { auth } from "@/server/platform/auth/auth";
import { settingsService } from "@/server/modules/settings/service";
import { updateProfileSchema, updateSettingsSchema } from "@/server/modules/settings/schemas";

export const updateSettings = action(updateSettingsSchema, async (ctx, input) => {
  const result = await settingsService.update(ctx, input);
  revalidatePath("/", "layout");
  return result;
});

export const updateProfile = action(updateProfileSchema, async (_ctx, input) => {
  await auth.api.updateUser({ body: { name: input.name }, headers: await headers() });
  revalidatePath("/", "layout");
  return { name: input.name };
});
