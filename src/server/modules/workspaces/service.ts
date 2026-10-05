import type { DbExecutor } from "@/server/platform/db/client";
import { newId } from "@/server/lib/ids";
import { workspaceRepository } from "./repository";

/**
 * Personal workspaces are created automatically for every user (ADR-005).
 * There is no workspace UI in the MVP.
 */
export const workspaceService = {
  async ensurePersonalWorkspace(db: DbExecutor, user: { id: string; name: string }) {
    const existing = await workspaceRepository.findPersonalMembership(db, user.id);
    if (existing) return existing;
    const id = newId();
    await workspaceRepository.insertPersonal(db, { id, name: `${user.name}'s workspace`, ownerUserId: user.id });
    return { workspaceId: id, role: "owner" as const };
  },

  findPersonalMembership(db: DbExecutor, userId: string) {
    return workspaceRepository.findPersonalMembership(db, userId);
  },
};
