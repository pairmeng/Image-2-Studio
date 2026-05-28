import { useEffect, useState } from "react";
import type { ImageBatchDetailResponse, ImageBatchItemResponse, ImageJobResponse, ImageJobsResponse, PublicUser } from "@/lib/types";
import type { ImageMode } from "@/lib/models";
import { fetchJson } from "@/components/studio/utils/api-client";

export type BatchGenerationStatus = "queued" | "creating" | "pending" | "paused" | "running" | "succeeded" | "failed";

export type BatchGenerationItem = {
  id: string;
  batchId?: string;
  index: number;
  provider: string;
  model: string;
  mode: ImageMode;
  prompt: string;
  size: string;
  aspectRatio: string;
  quality: string;
  status: BatchGenerationStatus;
  jobId?: string;
  resultId?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  retryCount?: number;
};

type JobScope = "recent" | "active" | "failed";
type JobAction = "pause" | "resume" | "kill";

type UseImageJobsOptions = {
  messages: {
    jobsLoadFailed: string;
    clearAlertsFailed: string;
    clearFinishedFailed: string;
    jobKillConfirm: string;
    jobKillFailed: string;
    generationFailed: string;
  };
  onUnauthorized: (errorOrResponse: unknown) => boolean;
  onError: (message: string) => void;
  onCurrentUserChange: (user: PublicUser) => void;
};

export function batchItemToGenerationItem(item: ImageBatchItemResponse): BatchGenerationItem {
  return {
    id: item.id,
    batchId: item.batchId,
    index: item.index,
    provider: item.provider,
    model: item.model,
    mode: item.mode,
    prompt: item.prompt,
    size: "",
    aspectRatio: "",
    quality: "",
    status: item.status,
    jobId: item.jobId,
    resultId: item.resultId,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    error: item.error,
    retryCount: item.retryCount
  };
}

function batchItemToJobStatus(status: ImageBatchItemResponse["status"]): ImageJobResponse["status"] {
  return status === "queued" || status === "creating" ? "pending" : status;
}

export function useImageJobs({
  messages,
  onUnauthorized,
  onError,
  onCurrentUserChange
}: UseImageJobsOptions) {
  const [batchItems, setBatchItems] = useState<BatchGenerationItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [batchFinishedAt, setBatchFinishedAt] = useState<number | null>(null);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [jobs, setJobs] = useState<ImageJobResponse[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobMonitorClearing, setJobMonitorClearing] = useState(false);
  const [jobMonitorFinishedClearing, setJobMonitorFinishedClearing] = useState(false);
  const [trackingJobId, setTrackingJobId] = useState("");
  const [jobActionId, setJobActionId] = useState("");

  function resetImageJobsState() {
    setBatchItems([]);
    setBatchRunning(false);
    resetBatchTiming();
    setActiveBatchId("");
    setJobs([]);
    setJobMonitorClearing(false);
    setJobMonitorFinishedClearing(false);
    setTrackingJobId("");
    setJobActionId("");
  }

  function updateBatchTiming(batch: ImageBatchDetailResponse, active: boolean) {
    const startedAt = new Date(batch.createdAt).getTime();
    const finishedAt = batch.finishedAt ? new Date(batch.finishedAt).getTime() : null;

    setBatchStartedAt(Number.isNaN(startedAt) ? Date.now() : startedAt);
    setBatchFinishedAt(finishedAt && !Number.isNaN(finishedAt) ? finishedAt : null);
    setBatchRunning(active);
  }

  function resetBatchTiming() {
    setBatchStartedAt(null);
    setBatchFinishedAt(null);
    setBatchElapsedSeconds(0);
    setBatchRunning(false);
  }

  function updateBatchItem(id: string, next: Partial<BatchGenerationItem>) {
    setBatchItems((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function mergeJobState(job: ImageJobResponse, options: { updateBatchItem?: boolean } = {}) {
    setJobs((current) => {
      const exists = current.some((item) => item.id === job.id);
      return exists
        ? current.map((item) => item.id === job.id ? job : item)
        : [job, ...current].slice(0, 30);
    });

    if (options.updateBatchItem !== false && job.batchItemId) {
      updateBatchItem(job.batchItemId, {
        status: job.status as BatchGenerationStatus,
        error: job.error,
        resultId: job.resultId,
        imageUrl: job.imageUrl,
        thumbnailUrl: job.thumbnailUrl
      });
    }
  }

  function mergeBatchJobStates(batch: ImageBatchDetailResponse, options: { updateBatchItems?: boolean } = {}) {
    batch.items.forEach((item) => {
      if (!item.jobId) return;

      mergeJobState({
        id: item.jobId,
        status: batchItemToJobStatus(item.status),
        provider: item.provider,
        model: item.model,
        mode: item.mode,
        prompt: item.prompt,
        batchId: batch.id,
        batchItemId: item.id,
        resultId: item.resultId,
        imageUrl: item.imageUrl,
        thumbnailUrl: item.thumbnailUrl,
        error: item.error,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt
      }, { updateBatchItem: options.updateBatchItems });
    });
  }

  async function loadJobs(scope: JobScope = "recent") {
    setJobsLoading(true);
    try {
      const body = await fetchJson<ImageJobsResponse>(`/api/images/jobs?scope=${scope}&limit=30`, {
        cache: "no-store",
        fallbackMessage: messages.jobsLoadFailed
      });
      setJobs(Array.isArray(body.jobs) ? body.jobs : []);
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    } finally {
      setJobsLoading(false);
    }
  }

  async function clearJobMonitorAlerts() {
    if (jobMonitorClearing) return;

    onError("");
    setJobMonitorClearing(true);

    try {
      const body = await fetchJson<{ user?: PublicUser }>("/api/images/jobs/monitor/clear", {
        method: "POST",
        fallbackMessage: messages.clearAlertsFailed
      });

      if (!body.user) {
        throw new Error(messages.clearAlertsFailed);
      }

      onCurrentUserChange(body.user);
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      onError(caught instanceof Error ? caught.message : messages.clearAlertsFailed);
    } finally {
      setJobMonitorClearing(false);
    }
  }

  async function clearFinishedJobMonitorItems() {
    if (jobMonitorFinishedClearing || !jobs.some((job) => job.status === "succeeded" || job.status === "failed")) return;

    onError("");
    setJobMonitorFinishedClearing(true);

    try {
      const body = await fetchJson<{ user?: PublicUser }>("/api/images/jobs/monitor/clear-finished", {
        method: "POST",
        fallbackMessage: messages.clearFinishedFailed
      });

      if (!body.user) {
        throw new Error(messages.clearFinishedFailed);
      }

      onCurrentUserChange(body.user);
      setJobs((current) => current.filter((job) => job.status !== "succeeded" && job.status !== "failed"));
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      onError(caught instanceof Error ? caught.message : messages.clearFinishedFailed);
    } finally {
      setJobMonitorFinishedClearing(false);
    }
  }

  async function changeImageJobState(jobId: string, action: JobAction) {
    if (jobActionId) return null;
    if (action === "kill" && !window.confirm(messages.jobKillConfirm)) return null;

    onError("");
    setJobActionId(jobId);

    try {
      const body = await fetchJson<Partial<ImageJobResponse>>(`/api/images/jobs/${jobId}/${action}`, {
        method: "POST",
        fallbackMessage: action === "kill" ? messages.jobKillFailed : messages.generationFailed
      });

      if (!body.id || !body.status) {
        throw new Error(action === "kill" ? messages.jobKillFailed : messages.generationFailed);
      }

      const job = body as ImageJobResponse;
      mergeJobState(job);
      await loadJobs();
      return job;
    } catch (caught) {
      if (onUnauthorized(caught)) return null;
      onError(caught instanceof Error ? caught.message : (action === "kill" ? messages.jobKillFailed : messages.generationFailed));
      return null;
    } finally {
      setJobActionId("");
    }
  }

  useEffect(() => {
    if (!batchStartedAt) {
      setBatchElapsedSeconds(0);
      return;
    }

    const tick = () => {
      const endAt = batchRunning ? Date.now() : (batchFinishedAt ?? Date.now());
      setBatchElapsedSeconds(Math.max(0, Math.floor((endAt - batchStartedAt) / 1000)));
    };

    tick();
    if (!batchRunning) return;

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [batchFinishedAt, batchRunning, batchStartedAt]);

  return {
    batchItems,
    setBatchItems,
    batchRunning,
    setBatchRunning,
    batchStartedAt,
    setBatchStartedAt,
    batchFinishedAt,
    setBatchFinishedAt,
    batchElapsedSeconds,
    setBatchElapsedSeconds,
    activeBatchId,
    setActiveBatchId,
    jobs,
    setJobs,
    jobsLoading,
    jobMonitorClearing,
    jobMonitorFinishedClearing,
    trackingJobId,
    setTrackingJobId,
    jobActionId,
    setJobActionId,
    resetImageJobsState,
    updateBatchTiming,
    resetBatchTiming,
    updateBatchItem,
    mergeJobState,
    mergeBatchJobStates,
    loadJobs,
    clearJobMonitorAlerts,
    clearFinishedJobMonitorItems,
    changeImageJobState
  };
}
