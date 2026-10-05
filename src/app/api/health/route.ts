import { sql } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { logger } from "@/server/platform/observability/logger";

export const dynamic = "force-dynamic";

/** Liveness and dependency check for the uptime monitor (Architecture §44). */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    logger.error({ err: error }, "health check failed");
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
