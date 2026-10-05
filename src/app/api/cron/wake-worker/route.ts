import { timingSafeEqual } from "node:crypto";
import { wakeWorker } from "@/server/platform/jobs/wake";

export const dynamic = "force-dynamic";

/**
 * Called once a day by the host's scheduler (vercel.json) so a worker that
 * sleeps while idle still runs its housekeeping: the hourly clean-up of
 * abandoned uploads and the 30-day trash purge run whenever it is awake.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok =
    Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  await wakeWorker();
  return Response.json({ status: "ok", worker: process.env.WORKER_URL ? "woken" : "not configured" });
}
