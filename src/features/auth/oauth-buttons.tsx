"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { FormAlert } from "./form-alert";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z"
    />
    <path
      fill="#34A853"
      d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z"
    />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
  </svg>
);
const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

export function OAuthButtons({ providers }: { providers: { google: boolean; microsoft: boolean } }) {
  const [pending, setPending] = useState<"google" | "microsoft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!providers.google && !providers.microsoft) return null;

  async function signIn(provider: "google" | "microsoft") {
    setPending(provider);
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/today" });
    if (error) {
      setError(authErrorMessage(error));
      setPending(null);
    }
  }

  return (
    <div className="grid gap-3">
      {error && <FormAlert>{error}</FormAlert>}
      {providers.google && (
        <Button
          variant="outline"
          onClick={() => signIn("google")}
          loading={pending === "google"}
          disabled={pending !== null}
        >
          {pending !== "google" && <GoogleIcon />}
          Continue with Google
        </Button>
      )}
      {providers.microsoft && (
        <Button
          variant="outline"
          onClick={() => signIn("microsoft")}
          loading={pending === "microsoft"}
          disabled={pending !== null}
        >
          {pending !== "microsoft" && <MicrosoftIcon />}
          Continue with Microsoft
        </Button>
      )}
      <div className="text-muted-foreground relative my-1 text-center text-xs">
        <span className="bg-border absolute inset-x-0 top-1/2 -z-10 h-px" aria-hidden />
        <span className="bg-card px-2">or with email</span>
      </div>
    </div>
  );
}
