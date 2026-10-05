"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(10, "Use at least 10 characters").max(128, "Keep it under 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "The passwords don't match" });

export function ChangePasswordForm() {
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (error) {
      if (error.code === "INVALID_PASSWORD") form.setError("currentPassword", { message: "That password isn't right" });
      else toast.error(authErrorMessage(error));
      return;
    }
    form.reset();
    toast.success("Password changed. Other devices were signed out.");
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormField id="current-password" label="Current password" error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </FormField>
      <FormField
        id="new-password"
        label="New password"
        hint="At least 10 characters."
        error={errors.newPassword?.message}
      >
        <Input type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </FormField>
      <FormField id="confirm-password" label="Confirm new password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </FormField>
      <div>
        <Button type="submit" loading={isSubmitting}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setPending(true);
    setError(undefined);
    const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
    setPending(false);
    if (error) {
      setError(error.code === "INVALID_PASSWORD" ? "That password isn't right" : authErrorMessage(error));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const canDelete = confirmText === "DELETE" && (!hasPassword || password.length > 0);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and everything in it: subjects, sections and topics. It can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4">
            {hasPassword && (
              <FormField id="delete-password" label="Your password" error={error}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormField>
            )}
            <FormField
              id="delete-confirm"
              label={
                <>
                  Type <strong className="mx-0.5">DELETE</strong> to confirm
                </>
              }
              error={!hasPassword ? error : undefined}
            >
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </FormField>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" loading={pending} disabled={!canDelete} onClick={onDelete}>
              Delete account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
