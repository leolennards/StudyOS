"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { FormAlert } from "./form-alert";
import { signUpSchema } from "./schemas";

export function SignUpForm({ verificationRequired }: { verificationRequired: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email({ ...values, callbackURL: "/today" });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    if (verificationRequired) {
      setSentTo(values.email);
      return;
    }
    router.replace("/today");
    router.refresh();
  });

  if (sentTo) {
    return (
      <FormAlert tone="success">
        We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="name" label="Name" error={errors.name?.message}>
        <Input autoComplete="name" autoFocus {...form.register("name")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </FormField>
      <FormField id="password" label="Password" hint="At least 10 characters." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <Button type="submit" className="mt-1 w-full" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
