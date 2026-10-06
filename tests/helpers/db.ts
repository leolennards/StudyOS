import { sql } from "drizzle-orm";
import { newId } from "@/server/lib/ids";
import type { RequestContext } from "@/server/lib/context";
import { getDb } from "@/server/platform/db/client";
import { users, workspaceMembers, workspaces } from "@/server/platform/db/schema";

/** Empties every table between tests. */
export async function resetDatabase() {
  await getDb().execute(
    sql`truncate table users, workspaces, workspace_members, subjects, sections, topics, documents, document_pages, document_topics, notes, note_topics, cards, card_topics, card_states, card_reviews, study_sessions, user_settings, accounts, sessions, verifications, rate_limits restart identity cascade`,
  );
}

/** Empties the job queue between tests. */
export async function resetJobs() {
  await getDb().execute(sql`delete from pgboss.job`);
}

/** Jobs waiting in a queue, oldest first. */
export async function queuedJobs(queue: string) {
  const result = await getDb().execute(
    sql`select data from pgboss.job where name = ${queue} and state = 'created' order by created_on`,
  );
  return result.rows.map((r) => (r as { data: unknown }).data);
}

/**
 * Creates a user with their personal workspace and returns the context the
 * services expect. Does not go through Better Auth: these tests exercise the
 * services, not the auth endpoints.
 */
export async function createTestUser(name = "Test Student"): Promise<RequestContext & { email: string }> {
  const db = getDb();
  const userId = newId();
  const email = `${userId}@example.test`;
  await db.insert(users).values({ id: userId, name, email, emailVerified: true });
  const workspaceId = newId();
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: `${name}'s workspace`, kind: "personal", ownerUserId: userId });
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  return { userId, workspaceId, role: "owner", email };
}
