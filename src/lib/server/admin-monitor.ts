import { prisma } from "./db";
import { getImageJobQueueSnapshot } from "./image-jobs";
import type { ImageJobQueueSnapshot } from "./image-job-diagnostics";

export type AdminMonitorResponse = {
  jobQueue: ImageJobQueueSnapshot;
  recentJobs: Array<{
    id: string;
    userEmail: string;
    status: string;
    provider: string;
    model: string;
    prompt: string;
    queueWaitMs?: number;
    executionMs?: number;
    upstreamMs?: number;
    fileSaveMs?: number;
    error?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
  }>;
};

export async function readAdminMonitor(): Promise<AdminMonitorResponse> {
  const [jobQueue, recentJobs] = await Promise.all([
    getImageJobQueueSnapshot(),
    prisma.imageJob.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 30,
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    })
  ]);

  return {
    jobQueue,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      userEmail: job.user.email,
      status: job.status,
      provider: job.provider,
      model: job.model,
      prompt: job.prompt,
      queueWaitMs: job.queueWaitMs ?? undefined,
      executionMs: job.executionMs ?? undefined,
      upstreamMs: job.upstreamMs ?? undefined,
      fileSaveMs: job.fileSaveMs ?? undefined,
      error: job.error ?? undefined,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      finishedAt: job.finishedAt?.toISOString()
    }))
  };
}
