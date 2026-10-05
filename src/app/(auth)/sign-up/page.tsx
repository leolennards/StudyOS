import Link from "next/link";
import type { Metadata } from "next";
import { env, oauthProviders } from "@/server/lib/env";
import { AuthCard } from "@/features/auth/auth-card";
import { OAuthButtons } from "@/features/auth/oauth-buttons";
import { SignUpForm } from "@/features/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="One place for your subjects, notes and revision."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        <OAuthButtons providers={oauthProviders()} />
        <SignUpForm verificationRequired={Boolean(env().RESEND_API_KEY)} />
      </div>
    </AuthCard>
  );
}
