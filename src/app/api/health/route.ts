import { NextResponse } from "next/server";
import { getImageJobQueueSnapshot } from "@/lib/server/image-jobs";
import { prisma } from "@/lib/server/db";
import { getAppVersion } from "@/lib/version";

export const runtime = "nodejs";

export async function GET() {
  let database: { ok: boolean; error?: string } = { ok: true };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    database = {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 180) : "Database check failed."
    };
  }

  let jobQueue: Awaited<ReturnType<typeof getImageJobQueueSnapshot>> | null = null;
  try {
    jobQueue = await getImageJobQueueSnapshot();
  } catch (error) {
    jobQueue = null;
    database = database.ok ? database : {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 180) : "Queue check failed."
    };
  }

  const queueOk = jobQueue ? jobQueue.queue.ok : false;
  const ok = database.ok && queueOk;

  return NextResponse.json({
    status: ok ? "ok" : "degraded",
    service: "image-2-studio",
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
    database,
    queueMode: jobQueue?.backend ?? "inline",
    workerRuntimeVersion: jobQueue?.workerRuntimeVersion ?? "unknown",
    queueConfigVersion: jobQueue?.configVersion ?? "unknown",
    jobQueue
  }, { status: ok ? 200 : 503 });
}
