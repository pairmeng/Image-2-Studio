import type { FormEvent, RefObject } from "react";
import type {
  ImageBatchDetailResponse,
  ImageJobResponse,
  ImageRecord
} from "@/lib/types";
import { isProviderId } from "@/lib/models";
import type { ImageMode, ProviderId } from "@/lib/models";
import {
  batchItemToGenerationItem,
  type BatchGenerationItem
} from "@/components/studio/hooks/use-image-jobs";
import type { PendingGeneration } from "@/components/studio/hooks/use-generation-runs";
import { useStudioState } from "@/components/studio/state/studio-context";
import {
  BATCH_QUEUE_TIMEOUT_MS,
  DEFAULT_MODE,
  JOB_POLL_INTERVAL_MS,
  JOB_POLL_TIMEOUT_MS,
  STUDIO_LAYOUT_STORAGE_KEY,
  getResolutionSelection,
  type GenerationInputMode
} from "@/components/studio/utils/generation-options";
import {
  insertBatchPromptTemplate as buildBatchPromptTemplateInsertion,
  getPromptFormat
} from "@/components/studio/utils/batch-prompts";
import type { Locale } from "@/components/studio/utils/copy";
import {
  buildBatchStartFormData,
  buildImageJobFormData,
  requestCreateImageJob,
  requestImageBatch,
  requestImageJob,
  requestPauseImageBatch,
  requestResumeImageBatch,
  requestRetryImageBatchItems,
  requestRetryImageJob,
  requestStartImageBatch,
  type ImageJobFormInput
} from "@/components/studio/utils/generation-api";
import {
  validateBatchGenerationInput,
  validateSingleGenerationInput,
  type GenerationValidationFailure
} from "@/components/studio/utils/generation-validation";
import {
  applyBatchGenerationItemDefaults,
  buildOptimisticImageJob,
  buildPendingGeneration,
  buildRunningBatchRun,
  buildRunningSingleRun,
  canUseServerBatchRetry,
  getBatchRetryItemIds,
  getBatchPollingDeadline,
  getCompletedBatchRunSummary,
  getGenerationReferenceCount,
  getLastSuccessfulBatchResultId,
  getRetryableBatchItems,
  hasBatchQueueTimeout
} from "@/components/studio/utils/generation-run-builders";
import {
  getPolledImageJobDecision,
  getPollImageJobPausedMessage,
  getPollImageJobStillRunningMessage,
  getTrackImageJobDecision,
  getTrackImageJobPausedMessage
} from "@/components/studio/utils/generation-job-tracking";
import { getImageRecordUrl } from "@/components/studio/utils/image-links";
import {
  mergeReferenceFiles,
  shouldSwitchToImageMode
} from "@/components/studio/utils/reference-files";
import { canContinueImageRecord } from "@/components/studio/utils/selected-record-context";
import {
  getSessionExpiredMessage,
  isSessionExpiredError
} from "@/components/studio/utils/session-expiry";

type StudioRunInput = {
  id: string;
  kind: "single" | "batch";
  status: "running" | "succeeded" | "failed";
  startedAt: number;
  background: boolean;
  jobId?: string;
  batchId?: string;
  prompt?: string;
  totalCount?: number;
  resultId?: string;
  error?: string;
};

type LoadHistoryOptions = {
  selectFirst?: boolean;
};

type UseGenerationActionsOptions = {
  locale: Locale;
  selectedModel: { capabilities: string[] } | undefined;
  isConfigured: boolean;
  supportsCustomSize: boolean;
  canUseImageMode: boolean;
  catalog: {
    providers: Array<{ provider: ProviderId; configured: boolean }>;
    models: Array<{ provider: ProviderId; modelId: string; capabilities: string[] }>;
  } | null;
  computedSize: string;
  batchPrompts: string[];
  batchParseErrorKey?: string;
  batchItems: BatchGenerationItem[];
  activeBatchId: string;
  loading: boolean;
  activeStudioRunIsRunning: boolean;
  t: (key: string) => string;
  isBatchDetailActive: (batch: ImageBatchDetailResponse) => boolean;
  loadBatchDetail: (batchId: string, options?: { showInStudio?: boolean }) => Promise<ImageBatchDetailResponse | null>;
  handleUnauthorized: (errorOrResponse: unknown) => boolean;
  closeLightbox: () => void;
  loadHistory: (options?: LoadHistoryOptions) => Promise<unknown>;
  loadBatches: () => Promise<unknown>;
  loadJobs: (scope?: "recent" | "active" | "failed") => Promise<unknown>;
  changeImageJobStateOnServer: (jobId: string, action: "pause" | "resume" | "kill") => Promise<ImageJobResponse | null>;
  setBatchItems: (value: BatchGenerationItem[] | ((current: BatchGenerationItem[]) => BatchGenerationItem[])) => void;
  setBatchRunning: (value: boolean | ((current: boolean) => boolean)) => void;
  setActiveBatchId: (value: string | ((current: string) => string)) => void;
  updateBatchTiming: (batch: ImageBatchDetailResponse, active: boolean) => void;
  resetBatchTiming: () => void;
  updateBatchItem: (id: string, next: Partial<BatchGenerationItem>) => void;
  mergeJobState: (job: ImageJobResponse, options?: { updateBatchItem?: boolean }) => void;
  mergeBatchJobStates: (batch: ImageBatchDetailResponse, options?: { updateBatchItems?: boolean }) => void;
  setTrackingJobId: (value: string | ((current: string) => string)) => void;
  setPendingGeneration: (value: PendingGeneration | null | ((current: PendingGeneration | null) => PendingGeneration | null)) => void;
  createStudioRunId: (kind: "single" | "batch", id: string) => string;
  setActiveStudioRun: (runId: string) => void;
  getActiveStudioRunId: () => string;
  isActiveStudioRun: (runId: string) => boolean;
  upsertStudioRun: (run: StudioRunInput) => void;
  updateStudioRun: (runId: string, next: Partial<StudioRunInput>) => void;
  showRunNotice: (message: string) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useGenerationActions({
  locale,
  selectedModel,
  isConfigured,
  supportsCustomSize,
  canUseImageMode,
  catalog,
  computedSize,
  batchPrompts,
  batchParseErrorKey,
  batchItems,
  activeBatchId,
  loading,
  activeStudioRunIsRunning,
  t,
  isBatchDetailActive,
  loadBatchDetail,
  handleUnauthorized,
  closeLightbox,
  loadHistory,
  loadBatches,
  loadJobs,
  changeImageJobStateOnServer,
  setBatchItems,
  setBatchRunning,
  setActiveBatchId,
  updateBatchTiming,
  resetBatchTiming,
  updateBatchItem,
  mergeJobState,
  mergeBatchJobStates,
  setTrackingJobId,
  setPendingGeneration,
  createStudioRunId,
  setActiveStudioRun,
  getActiveStudioRunId,
  isActiveStudioRun,
  upsertStudioRun,
  updateStudioRun,
  showRunNotice,
  promptRef,
  fileInputRef
}: UseGenerationActionsOptions) {
  const { state, actions } = useStudioState();
  const {
    provider,
    model,
    mode,
    prompt,
    generationInputMode,
    batchPromptText,
    aspectRatio,
    resolution,
    quality,
    inputFidelity,
    files,
    sourceImageIds
  } = state;
  const {
    setSelectedRecordId,
    setActiveView,
    setStudioLayout,
    setProvider,
    setModel,
    setMode,
    setPrompt,
    setGenerationInputMode,
    setBatchPromptText,
    setAspectRatio,
    setResolution,
    setQuality,
    setInputFidelity,
    setFiles,
    setSourceImageIds,
    setSettingsOpen,
    setParamsOpen,
    setQuickMenu,
    setLoading,
    setReferenceDragging,
    setError,
    setCopiedId,
    setCopiedPromptId
  } = actions;

  function updateProvider(nextProvider: ProviderId) {
    setProvider(nextProvider);
    setError("");
    setQuickMenu(null);
  }

  function chooseModel(nextModel: string) {
    setModel(nextModel);
    setQuickMenu(null);
  }

  function chooseAspectRatio(nextAspectRatio: string) {
    setAspectRatio(nextAspectRatio);
    setQuickMenu(null);
  }

  function chooseResolution(nextResolution: string) {
    const selection = getResolutionSelection({
      supportsCustomSize,
      resolution: nextResolution,
      locale
    });

    setResolution(selection.resolution);
    setQuickMenu(null);
    setError(selection.error);
  }

  function chooseQuality(nextQuality: string) {
    setQuality(nextQuality);
    setQuickMenu(null);
  }

  function chooseInputFidelity(nextInputFidelity: string) {
    setInputFidelity(nextInputFidelity);
    setQuickMenu(null);
  }

  function sendActiveRunToBackground(options: { showNotice?: boolean } = {}) {
    const runId = getActiveStudioRunId();
    if (runId) {
      updateStudioRun(runId, { background: true });
      setActiveStudioRun("");
      setPendingGeneration(null);
      setBatchRunning(false);
      if (options.showNotice !== false) {
        showRunNotice(t("backgroundRunQueued"));
      }
    }

    setActiveView("gallery");
    setParamsOpen(false);
    setQuickMenu(null);
    void loadJobs("active");
  }

  function keepActiveRunInStudio() {
    const runId = getActiveStudioRunId();
    if (!runId) return;

    updateStudioRun(runId, { background: false });
    setActiveView("studio");
    setParamsOpen(false);
    setQuickMenu(null);
  }

  function updateMode(nextMode: ImageMode) {
    if (nextMode === "image-to-image" && !canUseImageMode) {
      setError(t("imageOff"));
      return;
    }

    setMode(nextMode);
    setError("");
  }

  function updateGenerationInputMode(nextMode: GenerationInputMode) {
    if (loading) return;

    setGenerationInputMode(nextMode);
    setError("");
    setQuickMenu(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function insertBatchPromptTemplate() {
    if (loading) return;

    setBatchPromptText((current) => buildBatchPromptTemplateInsertion(current, mode, locale));
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function updateFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    const combined = mergeReferenceFiles(files, nextFiles);
    setFiles(combined);

    if (shouldSwitchToImageMode(combined, canUseImageMode)) {
      setMode("image-to-image");
      setParamsOpen(true);
    }
  }

  function handleReferenceDrag(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (loading || !canUseImageMode) return;
    setReferenceDragging(true);
  }

  function handleReferenceDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setReferenceDragging(false);

    if (loading || !canUseImageMode) return;
    updateFiles(event.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function openGenerationStudio() {
    const activeRunId = getActiveStudioRunId();
    if (activeRunId) {
      updateStudioRun(activeRunId, { background: true });
      setActiveStudioRun("");
      showRunNotice(t("backgroundRunQueued"));
    }

    setActiveView("studio");
    setParamsOpen(false);
    setQuickMenu(null);
    setSourceImageIds([]);
    setFiles([]);
    setPrompt("");
    setBatchPromptText("");
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setGenerationInputMode("single");
    setError("");
    setMode(DEFAULT_MODE);
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function returnToGallery() {
    if (loading) return;
    if (activeStudioRunIsRunning) {
      sendActiveRunToBackground();
      return;
    }

    setActiveView("gallery");
    setParamsOpen(false);
    setQuickMenu(null);
  }

  function clearOutputResult() {
    if (loading) return;
    const activeRunId = getActiveStudioRunId();
    if (activeRunId) {
      updateStudioRun(activeRunId, { background: true });
      setActiveStudioRun("");
    }

    setSelectedRecordId("");
    closeLightbox();
    setCopiedId("");
    setCopiedPromptId("");
    setPendingGeneration(null);
    setBatchRunning(false);
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setError("");
  }

  function toggleStudioLayout() {
    setStudioLayout((current) => {
      const next = current === "controls-left" ? "controls-right" : "controls-left";
      try {
        window.localStorage.setItem(STUDIO_LAYOUT_STORAGE_KEY, next);
      } catch {
        // Keep the in-memory preference even if persistence is unavailable.
      }
      return next;
    });
    setQuickMenu(null);
  }

  function startContinueEdit(record: ImageRecord) {
    if (!isProviderId(record.provider)) return;

    setActiveView("studio");
    setGenerationInputMode("single");
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setProvider(record.provider);
    setModel(record.model);
    setMode("image-to-image");
    setSourceImageIds([record.id]);
    setParamsOpen(true);
    setPrompt("");
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function canContinueRecord(record: ImageRecord) {
    return isProviderId(record.provider) && canContinueImageRecord(record, catalog);
  }

  function clearSource(id: string) {
    setSourceImageIds((current) => current.filter((item) => item !== id));
  }

  function getImageJobFormInput(promptValue: string): ImageJobFormInput {
    return {
      provider,
      model,
      mode,
      prompt: promptValue,
      size: computedSize,
      aspectRatio,
      resolution,
      quality,
      inputFidelity,
      sourceImageIds,
      files
    };
  }

  async function createImageJob(promptValue: string, batchMeta?: { batchId: string; itemId: string }) {
    try {
      return await requestCreateImageJob(
        buildImageJobFormData(getImageJobFormInput(promptValue), batchMeta),
        t("generationFailed")
      );
    } catch (caught) {
      if (handleUnauthorized(caught)) return null;
      throw caught;
    }
  }

  async function startBatch(prompts: string[]) {
    const fallbackMessage = locale === "zh" ? "批次启动失败。" : "Batch could not be started.";

    try {
      return await requestStartImageBatch(
        buildBatchStartFormData(getImageJobFormInput(prompts[0] ?? ""), prompts, getPromptFormat(batchPromptText)),
        fallbackMessage
      );
    } catch (caught) {
      if (handleUnauthorized(caught)) return null;
      throw caught;
    }
  }

  async function changeImageJobState(jobId: string, action: "pause" | "resume" | "kill") {
    const job = await changeImageJobStateOnServer(jobId, action);
    if (!job) return null;

    if (job.batchId && job.batchId === activeBatchId) {
      await loadBatchDetail(job.batchId, { showInStudio: true });
      if (action === "resume") {
        void pollBatchUntilFinished(job.batchId);
      }
    } else if (job.batchId) {
      await loadBatches();
    }

    return job;
  }

  async function runBatchItem(item: BatchGenerationItem) {
    updateBatchItem(item.id, {
      status: "creating",
      error: undefined,
      imageUrl: undefined,
      thumbnailUrl: undefined,
      resultId: undefined
    });

    const created = await createImageJob(item.prompt, item.batchId ? { batchId: item.batchId, itemId: item.id } : undefined);
    if (!created) {
      throw new Error(getSessionExpiredMessage(locale));
    }

    updateBatchItem(item.id, {
      status: "pending",
      jobId: created.jobId
    });
    updateBatchItem(item.id, { status: "running" });

    const job = await pollImageJob(created.jobId);
    updateBatchItem(item.id, {
      status: "succeeded",
      resultId: job.resultId,
      imageUrl: job.imageUrl,
      thumbnailUrl: job.thumbnailUrl,
      error: undefined
    });

    return job;
  }

  async function pollImageJob(jobId: string) {
    const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      let job: ImageJobResponse | null;
      try {
        job = await requestImageJob(jobId, t("generationFailed"));
      } catch (caught) {
        if (handleUnauthorized(caught)) {
          throw new Error(getSessionExpiredMessage(locale));
        }
        throw caught;
      }

      if (job) {
        mergeJobState(job);
      }

      const decision = getPolledImageJobDecision(job, {
        generationFailed: t("generationFailed"),
        paused: getPollImageJobPausedMessage(locale)
      });
      if (decision.kind === "succeeded") {
        return decision.job;
      }
      if (decision.kind === "error") {
        throw new Error(decision.message);
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    throw new Error(getPollImageJobStillRunningMessage(locale));
  }

  async function pollBatchUntilFinished(batchId: string, options: { runId?: string } = {}) {
    let deadline = Date.now() + BATCH_QUEUE_TIMEOUT_MS;
    let latest: ImageBatchDetailResponse | null = null;
    const shouldUpdateStudio = () => !options.runId || isActiveStudioRun(options.runId);

    while (Date.now() < deadline) {
      const fallbackMessage = locale === "zh" ? "批次状态加载失败。" : "Batch status could not be loaded.";
      let batch: ImageBatchDetailResponse;

      try {
        batch = await requestImageBatch(batchId, fallbackMessage);
      } catch (caught) {
        if (handleUnauthorized(caught)) {
          throw new Error(getSessionExpiredMessage(locale));
        }
        throw caught;
      }

      latest = batch;
      const updateStudio = shouldUpdateStudio();
      mergeBatchJobStates(latest, { updateBatchItems: updateStudio });
      deadline = getBatchPollingDeadline({
        createdAt: latest.createdAt,
        currentDeadline: deadline,
        timeoutMs: BATCH_QUEUE_TIMEOUT_MS,
        pollIntervalMs: JOB_POLL_INTERVAL_MS
      });

      const active = isBatchDetailActive(latest);
      if (updateStudio) {
        setBatchItems(latest.items.map(batchItemToGenerationItem));
        setBatchRunning(active);
        updateBatchTiming(latest, active);
      }

      if (!active) {
        await loadBatches();
        await loadHistory({ selectFirst: updateStudio });
        await loadJobs();
        if (updateStudio && hasBatchQueueTimeout(latest.items)) {
          setError(t("batchTimedOut"));
        }

        const lastSuccessfulResultId = getLastSuccessfulBatchResultId(latest.items);
        if (updateStudio && lastSuccessfulResultId) {
          setSelectedRecordId(lastSuccessfulResultId);
        }
        return latest;
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    const finalBatch = shouldUpdateStudio()
      ? await loadBatchDetail(batchId, { showInStudio: false })
      : latest;
    if (shouldUpdateStudio() && finalBatch && hasBatchQueueTimeout(finalBatch.items)) {
      setError(t("batchTimedOut"));
    }

    await loadBatches();
    return latest;
  }

  function startSingleRunPoll(runId: string, jobId: string) {
    void (async () => {
      try {
        const job = await pollImageJob(jobId);
        updateStudioRun(runId, {
          status: "succeeded",
          background: !isActiveStudioRun(runId),
          resultId: job.resultId,
          error: undefined
        });
        await loadHistory({ selectFirst: isActiveStudioRun(runId) });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setPendingGeneration(null);
          if (job.resultId) {
            setSelectedRecordId(job.resultId);
          }
        } else {
          showRunNotice(t("backgroundRunComplete"));
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t("generationFailed");
        updateStudioRun(runId, {
          status: "failed",
          background: !isActiveStudioRun(runId),
          error: message
        });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setPendingGeneration(null);
          setError(message);
        } else {
          showRunNotice(t("backgroundRunFailed"));
        }
      }
    })();
  }

  function startBatchRunPoll(runId: string, batchId: string) {
    void (async () => {
      try {
        const batch = await pollBatchUntilFinished(batchId, { runId });
        const summary = getCompletedBatchRunSummary(batch?.items ?? [], {
          batchTimedOut: t("batchTimedOut"),
          generationFailed: t("generationFailed")
        });

        updateStudioRun(runId, {
          status: summary.status,
          background: !isActiveStudioRun(runId),
          error: summary.error
        });
        await loadBatches();
        await loadHistory({ selectFirst: isActiveStudioRun(runId) });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setBatchRunning(false);
          if (summary.timedOut) {
            setError(t("batchTimedOut"));
          }
        } else {
          showRunNotice(summary.failed ? t("backgroundRunFailed") : t("backgroundRunComplete"));
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t("generationFailed");
        updateStudioRun(runId, {
          status: "failed",
          background: !isActiveStudioRun(runId),
          error: message
        });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setBatchRunning(false);
          setError(message);
        } else {
          showRunNotice(t("backgroundRunFailed"));
        }
      }
    })();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setActiveView("studio");

    if (generationInputMode === "batch") {
      await submitBatch();
      return;
    }

    await submitSingle();
  }

  function handleGenerationValidationFailure(result: GenerationValidationFailure) {
    setError(t(result.errorKey));
    if (result.openSettings) {
      setSettingsOpen(true);
    }
  }

  function getReferenceCount() {
    return getGenerationReferenceCount({ files, sourceImageIds });
  }

  async function submitSingle() {
    const validation = validateSingleGenerationInput({
      hasSelectedModel: Boolean(selectedModel),
      isConfigured,
      mode,
      referenceCount: getReferenceCount(),
      prompt
    });

    if (!validation.ok) {
      handleGenerationValidationFailure(validation);
      return;
    }

    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    const runStartedAt = Date.now();
    const pending = buildPendingGeneration({
      provider,
      model,
      mode,
      prompt: validation.prompt,
      size: computedSize,
      aspectRatio,
      quality,
      sourceImageIds,
      files,
      startedAt: runStartedAt
    });
    setPendingGeneration(pending);
    setLoading(true);
    let launched = false;

    try {
      const created = await createImageJob(validation.prompt);
      if (!created) return;

      launched = true;
      const runId = createStudioRunId("single", created.jobId);
      upsertStudioRun(buildRunningSingleRun({
        runId,
        jobId: created.jobId,
        startedAt: runStartedAt,
        prompt: validation.prompt
      }));
      setActiveStudioRun(runId);
      mergeJobState(buildOptimisticImageJob({
        jobId: created.jobId,
        status: created.status ?? "pending",
        provider,
        model,
        mode,
        prompt: validation.prompt,
        createdAt: runStartedAt
      }));
      startSingleRunPoll(runId, created.jobId);
      void loadJobs("active").catch((caught) => {
        console.warn("[images/jobs] active jobs refresh failed after single launch", {
          jobId: created.jobId,
          cause: caught instanceof Error ? caught.message : String(caught)
        });
      });
      setPrompt("");
      setFiles([]);
      setSourceImageIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
    } finally {
      setLoading(false);
      if (!launched) {
        setPendingGeneration(null);
      }
    }
  }

  async function submitBatch() {
    try {
      const validation = validateBatchGenerationInput({
        hasSelectedModel: Boolean(selectedModel),
        isConfigured,
        mode,
        referenceCount: getReferenceCount(),
        batchParseErrorKey,
        prompts: batchPrompts
      });

      if (!validation.ok) {
        handleGenerationValidationFailure(validation);
        return;
      }

      setLoading(true);
      const batch = await startBatch(validation.prompts);
      if (!batch) return;

      const initialItems = applyBatchGenerationItemDefaults(
        batch.items.map(batchItemToGenerationItem),
        { size: computedSize, aspectRatio, quality }
      );

      const runId = createStudioRunId("batch", batch.id);
      upsertStudioRun(buildRunningBatchRun({
        runId,
        batchId: batch.id,
        createdAt: batch.createdAt,
        totalCount: batch.items.length
      }));
      setActiveStudioRun(runId);
      setActiveBatchId(batch.id);
      setBatchItems(initialItems);
      setSelectedRecordId("");
      closeLightbox();
      setPendingGeneration(null);
      setBatchRunning(true);
      updateBatchTiming(batch, true);
      await Promise.all([loadJobs("active"), loadBatches()]);
      startBatchRunPoll(runId, batch.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function retryBatchOnServer(itemIds: string[]) {
    if (!activeBatchId || itemIds.length === 0) return;

    const fallbackMessage = locale === "zh" ? "重试失败。" : "Retry failed.";
    let batch: ImageBatchDetailResponse;

    try {
      batch = await requestRetryImageBatchItems(activeBatchId, itemIds, fallbackMessage);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      throw caught;
    }

    setBatchItems(batch.items.map(batchItemToGenerationItem));
    updateBatchTiming(batch, true);
    await pollBatchUntilFinished(activeBatchId);
    await loadJobs();
  }

  async function retryBatchItem(item: BatchGenerationItem) {
    if (loading || getRetryableBatchItems([item]).length === 0) return;

    setError("");
    setBatchRunning(true);
    setLoading(true);

    try {
      if (canUseServerBatchRetry(activeBatchId, [item])) {
        await retryBatchOnServer(getBatchRetryItemIds([item]));
      } else {
        const job = await runBatchItem(item);
        await loadHistory();
        if (job.resultId) {
          setSelectedRecordId(job.resultId);
        }
      }
    } catch (caught) {
      if (!isSessionExpiredError(caught)) {
        updateBatchItem(item.id, {
          status: "failed",
          error: caught instanceof Error ? caught.message : t("generationFailed")
        });
      }
    } finally {
      setLoading(false);
      setBatchRunning(false);
    }
  }

  async function retryFailedBatchItems() {
    const failedItems = getRetryableBatchItems(batchItems);
    if (loading || failedItems.length === 0) return;

    setError("");
    setBatchRunning(true);
    setLoading(true);
    let lastResultId = "";

    try {
      if (canUseServerBatchRetry(activeBatchId, failedItems)) {
        await retryBatchOnServer(getBatchRetryItemIds(failedItems));
        return;
      }

      await Promise.all(failedItems.map(async (item) => {
        updateBatchItem(item.id, {
          retryCount: (item.retryCount ?? 0) + 1
        });

        try {
          const job = await runBatchItem(item);
          if (job.resultId) {
            lastResultId = job.resultId;
          }
        } catch (caught) {
          if (isSessionExpiredError(caught)) return;

          updateBatchItem(item.id, {
            status: "failed",
            error: caught instanceof Error ? caught.message : t("generationFailed")
          });
        }
      }));

      await loadHistory();
      if (lastResultId) {
        setSelectedRecordId(lastResultId);
      }
    } finally {
      setLoading(false);
      setBatchRunning(false);
    }
  }

  async function pauseActiveBatch() {
    if (!activeBatchId || loading) return;

    setError("");
    setLoading(true);
    const fallbackMessage = locale === "zh" ? "暂停批次失败。" : "Batch could not be paused.";

    try {
      const batch = await requestPauseImageBatch(activeBatchId, fallbackMessage);
      const active = isBatchDetailActive(batch);
      setBatchItems(batch.items.map(batchItemToGenerationItem));
      setBatchRunning(active);
      updateBatchTiming(batch, active);
      await loadJobs();
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  }

  async function resumeActiveBatch() {
    if (!activeBatchId || loading) return;

    setError("");
    setLoading(true);
    const fallbackMessage = locale === "zh" ? "恢复批次失败。" : "Batch could not be resumed.";

    try {
      const batch = await requestResumeImageBatch(activeBatchId, fallbackMessage);
      setBatchItems(batch.items.map(batchItemToGenerationItem));
      setBatchRunning(isBatchDetailActive(batch));
      updateBatchTiming(batch, true);
      await loadJobs("active");
      void pollBatchUntilFinished(activeBatchId);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  }

  async function trackImageJob(job: ImageJobResponse) {
    setError("");
    const decision = getTrackImageJobDecision(job, {
      generationFailed: t("generationFailed"),
      paused: getTrackImageJobPausedMessage(locale)
    });

    if (decision.kind === "batch") {
      await loadBatchDetail(decision.batchId, {
        showInStudio: true
      });
      if (decision.shouldPoll) {
        await pollBatchUntilFinished(decision.batchId);
      }
      await loadJobs();
      return;
    }

    if (decision.kind === "select-result") {
      await loadHistory();
      setSelectedRecordId(decision.resultId);
      setActiveView("studio");
      return;
    }

    if (decision.kind === "error") {
      setError(decision.message);
      return;
    }

    setTrackingJobId(decision.jobId);
    try {
      const finished = await pollImageJob(decision.jobId);
      await loadHistory();
      await loadJobs();
      if (finished.resultId) {
        setSelectedRecordId(finished.resultId);
        setActiveView("studio");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
      await loadJobs();
    } finally {
      setTrackingJobId("");
    }
  }

  async function retryStandaloneJob(job: ImageJobResponse) {
    if (job.batchId) {
      await loadBatchDetail(job.batchId, { showInStudio: true });
      return;
    }

    setError("");
    setTrackingJobId(job.id);

    try {
      const fallbackMessage = locale === "zh" ? "任务重试失败。" : "Job retry failed.";
      const retried = await requestRetryImageJob(job.id, fallbackMessage);

      await loadJobs();
      const finished = await pollImageJob(retried.jobId);
      await loadHistory();
      await loadJobs();
      if (finished.resultId) {
        setSelectedRecordId(finished.resultId);
        setActiveView("studio");
      }
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
      await loadJobs();
    } finally {
      setTrackingJobId("");
    }
  }

  async function copyImage(record: ImageRecord) {
    await navigator.clipboard.writeText(getImageRecordUrl(record, window.location.origin));
    setCopiedId(record.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function copyPromptText(record: ImageRecord) {
    await navigator.clipboard.writeText(record.prompt);
    setCopiedPromptId(record.id);
    window.setTimeout(() => setCopiedPromptId(""), 1400);
  }

  async function loadBatchDetailAndPoll(batchId: string, options: { showInStudio?: boolean; pollActive?: boolean } = {}) {
    const batch = await loadBatchDetail(batchId, { showInStudio: options.showInStudio });
    if (options.pollActive && batch && isBatchDetailActive(batch)) {
      await pollBatchUntilFinished(batch.id);
    }
    return batch;
  }

  return {
    updateProvider,
    chooseModel,
    chooseAspectRatio,
    chooseResolution,
    chooseQuality,
    chooseInputFidelity,
    sendActiveRunToBackground,
    keepActiveRunInStudio,
    updateMode,
    updateGenerationInputMode,
    insertBatchPromptTemplate,
    updateFiles,
    handleReferenceDrag,
    handleReferenceDrop,
    removeFile,
    openGenerationStudio,
    returnToGallery,
    clearOutputResult,
    toggleStudioLayout,
    startContinueEdit,
    canContinueRecord,
    clearSource,
    changeImageJobState,
    pollBatchUntilFinished,
    submit,
    retryBatchItem,
    retryFailedBatchItems,
    pauseActiveBatch,
    resumeActiveBatch,
    trackImageJob,
    retryStandaloneJob,
    copyImage,
    copyPromptText,
    loadBatchDetailAndPoll
  };
}
