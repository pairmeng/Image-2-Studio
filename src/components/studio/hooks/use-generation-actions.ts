import type { FormEvent, RefObject } from "react";
import type {
  CreateImageJobResponse,
  ImageBatchDetailResponse,
  ImageJobResponse,
  ImageRecord
} from "@/lib/types";
import { isProviderId } from "@/lib/models";
import type { ImageMode, ProviderId } from "@/lib/models";
import { isRetryableBatchItemStatus } from "@/lib/image-job-state";
import {
  batchItemToGenerationItem,
  type BatchGenerationItem
} from "@/components/studio/hooks/use-image-jobs";
import type { PendingGeneration } from "@/components/studio/hooks/use-generation-runs";
import { useStudioState } from "@/components/studio/state/studio-context";
import {
  BATCH_QUEUE_TIMEOUT_MS,
  DEFAULT_MODE,
  OFFICIAL_OPENAI_RESOLUTION,
  JOB_POLL_INTERVAL_MS,
  JOB_POLL_TIMEOUT_MS,
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH,
  STUDIO_LAYOUT_STORAGE_KEY,
  isHighLoadResolution,
  modelSupports,
  type GenerationInputMode
} from "@/components/studio/utils/generation-options";
import {
  BATCH_PROMPT_END,
  BATCH_PROMPT_START,
  getBatchPromptTemplate,
  getPromptFormat
} from "@/components/studio/utils/batch-prompts";
import type { Locale } from "@/components/studio/utils/copy";

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
  handleUnauthorized: (response: Response) => boolean;
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
    if (!supportsCustomSize && nextResolution !== OFFICIAL_OPENAI_RESOLUTION) {
      setResolution(OFFICIAL_OPENAI_RESOLUTION);
      setQuickMenu(null);
      setError(locale === "zh"
        ? "官方 OpenAI 仅开放 1K；配置 OpenAI-compatible Base URL 后可使用 2K/4K。"
        : "Official OpenAI only allows 1K here. Configure an OpenAI-compatible Base URL to use 2K/4K.");
      return;
    }

    setResolution(nextResolution);
    setQuickMenu(null);

    if (isHighLoadResolution(nextResolution)) {
      setError(locale === "zh"
        ? "4K 会显著增加上游网关负载，部分 OpenAI-compatible 网关可能拒绝或超时；如果失败请改用 2K。"
        : "4K is high load for upstream gateways. Some OpenAI-compatible gateways may reject it or time out; use 2K if it fails.");
    } else {
      setError("");
    }
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

    const template = getBatchPromptTemplate(mode, locale);
    const emptyBlock = `${BATCH_PROMPT_START}\n\n${BATCH_PROMPT_END}`;
    setBatchPromptText((current) => current.trim() ? `${current.trimEnd()}\n\n${emptyBlock}` : template);
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function updateFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    const combined = [...files, ...Array.from(nextFiles)].slice(0, 4);
    setFiles(combined);

    if (combined.length > 0 && canUseImageMode) {
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
    return Boolean(
      isProviderId(record.provider)
      && catalog?.providers.find((item) => item.provider === record.provider)?.configured
      && modelSupports(catalog?.models.find((item) => item.provider === record.provider && item.modelId === record.model), "continue-edit")
    );
  }

  function clearSource(id: string) {
    setSourceImageIds((current) => current.filter((item) => item !== id));
  }

  function buildImageJobFormData(promptValue: string, batchMeta?: { batchId: string; itemId: string }) {
    const formData = new FormData();
    formData.set("provider", provider);
    formData.set("model", model);
    formData.set("mode", mode);
    formData.set("prompt", promptValue);
    formData.set("size", computedSize);
    formData.set("aspectRatio", aspectRatio);
    formData.set("resolution", resolution);
    formData.set("quality", quality);
    formData.set("inputFidelity", inputFidelity);
    if (batchMeta) {
      formData.set("batchId", batchMeta.batchId);
      formData.set("batchItemId", batchMeta.itemId);
    }
    sourceImageIds.forEach((id) => formData.append("sourceImageIds", id));
    files.forEach((file) => formData.append("files", file));

    return formData;
  }

  function buildBatchStartFormData(prompts: string[]) {
    const formData = buildImageJobFormData(prompts[0] ?? "");
    formData.delete("prompt");
    formData.set("prompts", JSON.stringify(prompts));
    formData.set("promptFormat", getPromptFormat(batchPromptText));

    return formData;
  }

  async function createImageJob(promptValue: string, batchMeta?: { batchId: string; itemId: string }) {
    const response = await fetch("/api/images/create", {
      method: "POST",
      body: buildImageJobFormData(promptValue, batchMeta)
    });
    const body = (await response.json().catch(() => ({}))) as Partial<CreateImageJobResponse> & { error?: string };

    if (handleUnauthorized(response)) return null;

    if (!response.ok) {
      throw new Error(body.error || t("generationFailed"));
    }

    if (!body.jobId) {
      throw new Error(t("generationFailed"));
    }

    return {
      jobId: body.jobId,
      status: body.status ?? "pending"
    };
  }

  async function startBatch(prompts: string[]) {
    const response = await fetch("/api/images/batches/start", {
      method: "POST",
      body: buildBatchStartFormData(prompts)
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

    if (handleUnauthorized(response)) return null;

    if (!response.ok || !body.id || !Array.isArray(body.items)) {
      throw new Error(body.error || (locale === "zh" ? "批次启动失败。" : "Batch could not be started."));
    }

    return body as ImageBatchDetailResponse;
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
      throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
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

  function isSessionExpiredError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("session expired") || message.includes("登录已过期");
  }

  async function pollImageJob(jobId: string) {
    const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const response = await fetch(`/api/images/jobs/${jobId}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<ImageJobResponse> & { error?: string };

      if (handleUnauthorized(response)) {
        throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
      }

      if (!response.ok) {
        throw new Error(body.error || t("generationFailed"));
      }

      const job = body.id && body.status ? body as ImageJobResponse : null;
      if (job) {
        mergeJobState(job);
      }

      if (job?.status === "succeeded") {
        if (!job.resultId) {
          throw new Error(t("generationFailed"));
        }

        return job;
      }

      if (job?.status === "failed") {
        throw new Error(job.error || t("generationFailed"));
      }

      if (job?.status === "paused") {
        throw new Error(locale === "zh" ? "\u4efb\u52a1\u5df2\u6682\u505c\uff0c\u6062\u590d\u540e\u4f1a\u7ee7\u7eed\u6392\u961f\u3002" : "The job is paused. Resume it to continue.");
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    throw new Error(locale === "zh"
      ? "生成任务仍在运行，请稍后刷新历史记录查看结果。"
      : "The generation job is still running. Refresh history later to check the result.");
  }

  async function pollBatchUntilFinished(batchId: string, options: { runId?: string } = {}) {
    let deadline = Date.now() + BATCH_QUEUE_TIMEOUT_MS;
    let latest: ImageBatchDetailResponse | null = null;
    const shouldUpdateStudio = () => !options.runId || isActiveStudioRun(options.runId);

    while (Date.now() < deadline) {
      const response = await fetch(`/api/images/batches/${batchId}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

      if (handleUnauthorized(response)) {
        throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
      }

      if (!response.ok || !body.id || !Array.isArray(body.items)) {
        throw new Error(body.error || (locale === "zh" ? "批次状态加载失败。" : "Batch status could not be loaded."));
      }

      latest = body as ImageBatchDetailResponse;
      const updateStudio = shouldUpdateStudio();
      mergeBatchJobStates(latest, { updateBatchItems: updateStudio });
      const batchStartedAt = new Date(latest.createdAt).getTime();
      if (!Number.isNaN(batchStartedAt)) {
        deadline = batchStartedAt + BATCH_QUEUE_TIMEOUT_MS + JOB_POLL_INTERVAL_MS;
      }

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
        if (updateStudio && latest.items.some((item) => item.error?.includes("10 minute queue limit"))) {
          setError(t("batchTimedOut"));
        }

        const lastSuccessful = [...latest.items].reverse().find((item) => item.resultId);
        if (updateStudio && lastSuccessful?.resultId) {
          setSelectedRecordId(lastSuccessful.resultId);
        }
        return latest;
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    const finalBatch = shouldUpdateStudio()
      ? await loadBatchDetail(batchId, { showInStudio: false })
      : latest;
    if (shouldUpdateStudio() && finalBatch?.items.some((item) => item.error?.includes("10 minute queue limit"))) {
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
        const failed = batch?.items.some((item) => item.status === "failed") ?? false;
        const timedOut = batch?.items.some((item) => item.error?.includes("10 minute queue limit")) ?? false;

        updateStudioRun(runId, {
          status: failed ? "failed" : "succeeded",
          background: !isActiveStudioRun(runId),
          error: failed ? (timedOut ? t("batchTimedOut") : t("generationFailed")) : undefined
        });
        await loadBatches();
        await loadHistory({ selectFirst: isActiveStudioRun(runId) });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setBatchRunning(false);
          if (timedOut) {
            setError(t("batchTimedOut"));
          }
        } else {
          showRunNotice(failed ? t("backgroundRunFailed") : t("backgroundRunComplete"));
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

  async function submitSingle() {
    if (!selectedModel) {
      setError(t("chooseModelFirst"));
      setSettingsOpen(true);
      return;
    }

    if (!isConfigured) {
      setError(t("providerNoKey"));
      setSettingsOpen(true);
      return;
    }

    const singlePrompt = prompt.trim();
    if (!singlePrompt) {
      setError(t("enterPrompt"));
      return;
    }

    if (singlePrompt.length > MAX_PROMPT_LENGTH) {
      setError(t("batchPromptTooLong"));
      return;
    }

    if (mode === "image-to-image" && files.length + sourceImageIds.length === 0) {
      setError(t("imageNeedsReference"));
      return;
    }

    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    const runStartedAt = Date.now();
    const pending: PendingGeneration = {
      provider,
      model,
      mode,
      prompt: singlePrompt,
      size: computedSize,
      aspectRatio,
      quality,
      sourceImageIds: [...sourceImageIds],
      fileNames: files.map((file) => file.name),
      startedAt: runStartedAt
    };
    setPendingGeneration(pending);
    setLoading(true);
    let launched = false;

    try {
      const created = await createImageJob(singlePrompt);
      if (!created) return;

      launched = true;
      const runId = createStudioRunId("single", created.jobId);
      upsertStudioRun({
        id: runId,
        kind: "single",
        status: "running",
        startedAt: runStartedAt,
        background: false,
        jobId: created.jobId,
        prompt: singlePrompt
      });
      setActiveStudioRun(runId);
      mergeJobState({
        id: created.jobId,
        status: created.status ?? "pending",
        provider,
        model,
        mode,
        prompt: singlePrompt,
        createdAt: new Date(runStartedAt).toISOString()
      });
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
      if (!selectedModel) {
        setError(t("chooseModelFirst"));
        setSettingsOpen(true);
        return;
      }

      if (!isConfigured) {
        setError(t("providerNoKey"));
        setSettingsOpen(true);
        return;
      }

      if (batchParseErrorKey) {
        setError(t(batchParseErrorKey));
        return;
      }

      const prompts = batchPrompts;
      if (prompts.length === 0) {
        setError(t("enterPrompt"));
        return;
      }

      if (prompts.length > MAX_BATCH_PROMPTS) {
        setError(t("batchTooManyPrompts"));
        return;
      }

      if (prompts.some((item) => item.length > MAX_PROMPT_LENGTH)) {
        setError(t("batchPromptTooLong"));
        return;
      }

      if (mode === "image-to-image" && files.length + sourceImageIds.length === 0) {
        setError(t("imageNeedsReference"));
        return;
      }

      setLoading(true);
      const batch = await startBatch(prompts);
      if (!batch) return;

      const initialItems = batch.items.map((item) => ({
        ...batchItemToGenerationItem(item),
        size: computedSize,
        aspectRatio,
        quality
      }));

      const runId = createStudioRunId("batch", batch.id);
      upsertStudioRun({
        id: runId,
        kind: "batch",
        status: "running",
        startedAt: new Date(batch.createdAt).getTime() || Date.now(),
        background: false,
        batchId: batch.id,
        totalCount: batch.items.length
      });
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

    const response = await fetch(`/api/images/batches/${activeBatchId}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds })
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok || !body.id || !Array.isArray(body.items)) {
      throw new Error(body.error || (locale === "zh" ? "重试失败。" : "Retry failed."));
    }

    const batch = body as ImageBatchDetailResponse;
    setBatchItems(batch.items.map(batchItemToGenerationItem));
    updateBatchTiming(batch, true);
    await pollBatchUntilFinished(activeBatchId);
    await loadJobs();
  }

  async function retryBatchItem(item: BatchGenerationItem) {
    if (loading || item.status !== "failed") return;

    setError("");
    setBatchRunning(true);
    setLoading(true);

    try {
      if (activeBatchId && item.batchId) {
        await retryBatchOnServer([item.id]);
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
    const failedItems = batchItems.filter((item) => isRetryableBatchItemStatus(item.status));
    if (loading || failedItems.length === 0) return;

    setError("");
    setBatchRunning(true);
    setLoading(true);
    let lastResultId = "";

    try {
      if (activeBatchId && failedItems.every((item) => item.batchId)) {
        await retryBatchOnServer(failedItems.map((item) => item.id));
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

  async function trackImageJob(job: ImageJobResponse) {
    setError("");

    if (job.batchId) {
      await loadBatchDetail(job.batchId, {
        showInStudio: true
      });
      if (job.status === "pending" || job.status === "running") {
        await pollBatchUntilFinished(job.batchId);
      }
      await loadJobs();
      return;
    }

    if (job.status === "succeeded" && job.resultId) {
      await loadHistory();
      setSelectedRecordId(job.resultId);
      setActiveView("studio");
      return;
    }

    if (job.status === "failed") {
      setError(job.error || t("generationFailed"));
      return;
    }

    if (job.status === "paused") {
      setError(locale === "zh" ? "\u4efb\u52a1\u5df2\u6682\u505c\uff0c\u8bf7\u5148\u6062\u590d\u4efb\u52a1\u3002" : "This job is paused. Resume it before tracking.");
      return;
    }

    setTrackingJobId(job.id);
    try {
      const finished = await pollImageJob(job.id);
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
      const response = await fetch(`/api/images/jobs/${job.id}/retry`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as Partial<CreateImageJobResponse> & { error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok || !body.jobId) {
        throw new Error(body.error || (locale === "zh" ? "任务重试失败。" : "Job retry failed."));
      }

      await loadJobs();
      const finished = await pollImageJob(body.jobId);
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

  async function copyImage(record: ImageRecord) {
    const url = new URL(record.imageUrl, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
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
    trackImageJob,
    retryStandaloneJob,
    copyImage,
    copyPromptText,
    loadBatchDetailAndPoll
  };
}
