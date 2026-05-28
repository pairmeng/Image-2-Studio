import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageMode } from "@/lib/models";

export type PendingGeneration = {
  provider: string;
  model: string;
  mode: ImageMode;
  prompt: string;
  size: string;
  aspectRatio: string;
  quality: string;
  sourceImageIds: string[];
  fileNames: string[];
  startedAt: number;
};

export type StudioRunKind = "single" | "batch";
export type StudioRunStatus = "running" | "succeeded" | "failed";

export type StudioRun = {
  id: string;
  kind: StudioRunKind;
  status: StudioRunStatus;
  startedAt: number;
  background: boolean;
  jobId?: string;
  batchId?: string;
  prompt?: string;
  totalCount?: number;
  resultId?: string;
  error?: string;
};

const RUN_NOTICE_TIMEOUT_MS = 5200;

export function useGenerationRuns() {
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [activeStudioRunId, setActiveStudioRunId] = useState("");
  const [backgroundRuns, setBackgroundRuns] = useState<StudioRun[]>([]);
  const [runNotice, setRunNotice] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const activeStudioRunIdRef = useRef("");
  const runNoticeTimerRef = useRef<number | null>(null);

  const activeStudioRun = useMemo(
    () => backgroundRuns.find((run) => run.id === activeStudioRunId),
    [activeStudioRunId, backgroundRuns]
  );
  const activeStudioRunIsRunning = activeStudioRun?.status === "running";
  const runningBackgroundRuns = useMemo(
    () => backgroundRuns.filter((run) => run.status === "running" && run.background),
    [backgroundRuns]
  );

  function createStudioRunId(kind: StudioRunKind, id: string) {
    return `${kind}:${id}:${Date.now()}`;
  }

  function setActiveStudioRun(runId: string) {
    activeStudioRunIdRef.current = runId;
    setActiveStudioRunId(runId);
  }

  function getActiveStudioRunId() {
    return activeStudioRunIdRef.current;
  }

  function isActiveStudioRun(runId: string) {
    return activeStudioRunIdRef.current === runId;
  }

  function upsertStudioRun(run: StudioRun) {
    setBackgroundRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 24));
  }

  function updateStudioRun(runId: string, next: Partial<StudioRun>) {
    setBackgroundRuns((current) => current.map((run) => run.id === runId ? { ...run, ...next } : run));
  }

  function showRunNotice(message: string) {
    setRunNotice(message);
    if (runNoticeTimerRef.current) {
      window.clearTimeout(runNoticeTimerRef.current);
    }
    runNoticeTimerRef.current = window.setTimeout(() => setRunNotice(""), RUN_NOTICE_TIMEOUT_MS);
  }

  function resetGenerationRunsState() {
    if (runNoticeTimerRef.current) {
      window.clearTimeout(runNoticeTimerRef.current);
      runNoticeTimerRef.current = null;
    }

    setPendingGeneration(null);
    setActiveStudioRun("");
    setBackgroundRuns([]);
    setRunNotice("");
    setElapsedSeconds(0);
  }

  useEffect(() => {
    activeStudioRunIdRef.current = activeStudioRunId;
  }, [activeStudioRunId]);

  useEffect(() => () => {
    if (runNoticeTimerRef.current) {
      window.clearTimeout(runNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!pendingGeneration) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - pendingGeneration.startedAt) / 1000)));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingGeneration]);

  return {
    pendingGeneration,
    setPendingGeneration,
    runNotice,
    elapsedSeconds,
    activeStudioRunIsRunning,
    runningBackgroundRuns,
    createStudioRunId,
    setActiveStudioRun,
    getActiveStudioRunId,
    isActiveStudioRun,
    upsertStudioRun,
    updateStudioRun,
    showRunNotice,
    resetGenerationRunsState
  };
}
