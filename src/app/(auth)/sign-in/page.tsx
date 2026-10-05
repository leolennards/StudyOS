import Link from "next/link";
import type { Metadata } from "next";
import { oauthProviders } from "@/server/lib/env";
import { AuthCard } from "@/features/auth/auth-card";
import { OAuthButtons } from "@/features/auth/oauth-buttons";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue studying."
      footer={
        <>
          New to StudyOS?{" "}
          <Link href="/sign-up" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        <OAuthButtons providers={oauthProviders()} />
        <SignInForm />
      </div>
    </AuthCard>
  );
}
