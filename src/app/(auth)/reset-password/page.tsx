import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/auth-card";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm token={typeof token === "string" ? token : null} />
    </AuthCard>
  );
}
