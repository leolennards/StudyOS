import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "@/server/platform/db/client";
import { workspaceMembers, workspaces } from "@/server/platform/db/schema";

export const workspaceRepository = {
  async insertPersonal(db: DbExecutor, input: { id: string; name: string; ownerUserId: string }) {
    await db.insert(workspaces).values({ ...input, kind: "personal" });
    await db.insert(workspaceMembers).values({ workspaceId: input.id, userId: input.ownerUserId, role: "owner" });
  },

  async findPersonalMembership(db: DbExecutor, userId: string) {
    const rows = await db
      .select({ workspaceId: workspaces.id, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.kind, "personal")))
      .limit(1);
    return rows[0] ?? null;
  },
};
