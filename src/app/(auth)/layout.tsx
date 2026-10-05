import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { getSession } from "@/server/platform/auth/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/today");
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b to-transparent"
      />
      <Link
        href="/"
        className="focus-visible:ring-ring/50 mb-8 rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <Logo />
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
