"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/features/knowledge/use-action";
import { updateProfile } from "@/server/actions/settings";
import { updateProfileSchema } from "@/server/modules/settings/schemas";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { run, pending } = useAction();
  const form = useForm<z.input<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const ok = await run(() => updateProfile(values), { success: "Profile saved" });
    if (ok) form.reset(values);
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormField id="profile-name" label="Name" error={form.formState.errors.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </FormField>
      <FormField id="profile-email" label="Email" hint="Your sign-in email can't be changed yet.">
        <Input value={email} readOnly disabled />
      </FormField>
      <div>
        <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
          Save
        </Button>
      </div>
    </form>
  );
}
