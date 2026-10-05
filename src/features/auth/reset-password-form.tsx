"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { FormAlert } from "./form-alert";
import { resetPasswordSchema } from "./schemas";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  if (!token) {
    return (
      <FormAlert>
        This reset link is missing or incomplete.{" "}
        <Link href="/forgot-password" className="underline">
          Request a new one
        </Link>
        .
      </FormAlert>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <FormAlert tone="success">
        Your password has been changed and other devices were signed out.{" "}
        <Link href="/sign-in" className="font-medium underline">
          Sign in
        </Link>
      </FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="password" label="New password" hint="At least 10 characters." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" autoFocus {...form.register("password")} />
      </FormField>
      <FormField id="confirm" label="Confirm new password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </FormField>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
