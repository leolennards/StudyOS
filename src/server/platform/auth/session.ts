import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/server/lib/errors";
import type { RequestContext } from "@/server/lib/context";
import { getDb } from "@/server/platform/db/client";
import { workspaceService } from "@/server/modules/workspaces/service";
import { auth } from "./auth";

export type SessionUser = { id: string; name: string; email: string; image: string | null };

/** The signed-in user and their workspace context, memoised per request. */
export const getSession = cache(async (): Promise<{ user: SessionUser; ctx: RequestContext } | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { user } = session;
  const membership = await workspaceService.ensurePersonalWorkspace(getDb(), user);
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    ctx: { userId: user.id, workspaceId: membership.workspaceId, role: membership.role },
  };
});

/** For pages and layouts: redirects to sign-in when there is no session. */
export async function requirePageSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** For Server Actions and Route Handlers: throws a typed error instead of redirecting. */
export async function requireContext(): Promise<RequestContext> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHENTICATED");
  return session.ctx;
}
