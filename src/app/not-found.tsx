import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-primary text-sm font-medium">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
        <p className="text-muted-foreground mt-2">It may have been deleted, or the link might be wrong.</p>
        <Button asChild className="mt-6">
          <Link href="/today">Go to Today</Link>
        </Button>
      </div>
    </div>
  );
}
