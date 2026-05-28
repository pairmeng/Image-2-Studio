import { useMemo } from "react";
import type { ImageMode } from "@/lib/models";
import type {
  CatalogResponse,
  ImageBatchResponse,
  ImageJobResponse,
  ImageProjectResponse,
  ImageRecord,
  PromptTemplateResponse
} from "@/lib/types";
import type { BatchGenerationItem } from "@/components/studio/hooks/use-image-jobs";
import type { HistoryFilter } from "@/components/studio/state/studio-state";
import { getBatchInputSummary } from "@/components/studio/utils/batch-input-summary";
import { getBatchProgressSummary } from "@/components/studio/utils/batch-progress";
import { getCopy, type Locale } from "@/components/studio/utils/copy";
import {
  getAllHistoryTags,
  getVisiblePromptTemplates
} from "@/components/studio/utils/gallery-derived-lists";
import {
  areHistoryFiltersActive,
  filterHistoryRecords
} from "@/components/studio/utils/history-filtering";
import { getHistorySelectionContext } from "@/components/studio/utils/history-selection-context";
import { getJobMonitorSummary } from "@/components/studio/utils/job-monitor-summary";
import { getProviderModelContext } from "@/components/studio/utils/provider-model-context";
import { getSelectedRecordContext } from "@/components/studio/utils/selected-record-context";
import {
  getJobMonitorLabels,
  getLightboxLabels,
  getStudioMainClassName
} from "@/components/studio/utils/studio-view-model";
import { formatDuration } from "@/components/studio/utils/format";
import type { GenerationInputMode, StudioLayout, StudioView } from "@/components/studio/utils/generation-options";

type UseStudioDerivedStateInput = {
  activeView: StudioView;
  studioLayout: StudioLayout;
  catalog: CatalogResponse | null;
  provider: string;
  model: string;
  mode: ImageMode;
  aspectRatio: string;
  resolution: string;
  records: ImageRecord[];
  batches: ImageBatchResponse[];
  projects: ImageProjectResponse[];
  templates: PromptTemplateResponse[];
  favoriteOnly: boolean;
  favoriteRecordIds: string[];
  historyFilter: HistoryFilter;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
  historySearch: string;
  selectedRecordId: string;
  selectedHistoryIds: string[];
  deletingHistoryIds: string[];
  sourceImageIds: string[];
  batchPromptText: string;
  generationInputMode: GenerationInputMode;
  prompt: string;
  batchItems: BatchGenerationItem[];
  batchElapsedSeconds: number;
  jobs: ImageJobResponse[];
  jobMonitorClearedAt?: string | null;
  locale: Locale;
};

export function useStudioDerivedState({
  activeView,
  studioLayout,
  catalog,
  provider,
  model,
  mode,
  aspectRatio,
  resolution,
  records,
  batches,
  projects,
  templates,
  favoriteOnly,
  favoriteRecordIds,
  historyFilter,
  historyBatchFilter,
  historyProjectFilter,
  historyTagFilter,
  historySearch,
  selectedRecordId,
  selectedHistoryIds,
  deletingHistoryIds,
  sourceImageIds,
  batchPromptText,
  generationInputMode,
  prompt,
  batchItems,
  batchElapsedSeconds,
  jobs,
  jobMonitorClearedAt,
  locale
}: UseStudioDerivedStateInput) {
  const providerModelContext = useMemo(
    () => getProviderModelContext({
      catalog,
      provider,
      model,
      aspectRatio,
      resolution
    }),
    [aspectRatio, catalog, model, provider, resolution]
  );

  const filteredRecords = useMemo(
    () => filterHistoryRecords({
      records,
      catalog,
      batches,
      projects,
      favoriteOnly,
      favoriteRecordIds,
      historyFilter,
      historyBatchFilter,
      historyProjectFilter,
      historyTagFilter,
      historySearch
    }),
    [batches, catalog, favoriteOnly, favoriteRecordIds, historyBatchFilter, historyFilter, historyProjectFilter, historySearch, historyTagFilter, projects, records]
  );

  const historySelectionContext = useMemo(
    () => getHistorySelectionContext({
      records,
      filteredRecords,
      favoriteRecordIds,
      selectedHistoryIds,
      deletingHistoryIds
    }),
    [deletingHistoryIds, favoriteRecordIds, filteredRecords, records, selectedHistoryIds]
  );

  const historyFiltersActive = useMemo(
    () => areHistoryFiltersActive({
      favoriteOnly,
      historyFilter,
      historyBatchFilter,
      historyProjectFilter,
      historyTagFilter,
      historySearch
    }),
    [favoriteOnly, historyBatchFilter, historyFilter, historyProjectFilter, historySearch, historyTagFilter]
  );

  const selectedRecordContext = useMemo(
    () => getSelectedRecordContext({
      records,
      selectedRecordId,
      catalog,
      sourceImageIds
    }),
    [catalog, records, selectedRecordId, sourceImageIds]
  );

  const batchInputSummary = useMemo(
    () => getBatchInputSummary({
      batchPromptText,
      generationInputMode,
      prompt,
      t: (key) => getCopy(locale, key)
    }),
    [batchPromptText, generationInputMode, prompt, locale]
  );
  const batchProgress = useMemo(() => getBatchProgressSummary(batchItems), [batchItems]);
  const allTags = useMemo(() => getAllHistoryTags(records), [records]);
  const visibleTemplates = useMemo(() => getVisiblePromptTemplates(templates, mode), [mode, templates]);
  const jobMonitorSummary = useMemo(
    () => getJobMonitorSummary(jobs, jobMonitorClearedAt),
    [jobMonitorClearedAt, jobs]
  );
  const batchElapsedLabel = useMemo(() => formatDuration(batchElapsedSeconds), [batchElapsedSeconds]);
  const mainClassName = useMemo(
    () => getStudioMainClassName({
      activeView,
      studioLayout,
      selectedHistoryCount: selectedHistoryIds.length
    }),
    [activeView, selectedHistoryIds.length, studioLayout]
  );
  const jobMonitorLabels = useMemo(
    () => getJobMonitorLabels({
      locale,
      t: (key) => getCopy(locale, key),
      activeCount: jobMonitorSummary.activeJobs.length,
      failedCount: jobMonitorSummary.failedJobs.length,
      succeededCount: jobMonitorSummary.succeededJobs.length
    }),
    [jobMonitorSummary.activeJobs.length, jobMonitorSummary.failedJobs.length, jobMonitorSummary.succeededJobs.length, locale]
  );
  const lightboxLabels = useMemo(
    () => getLightboxLabels({
      locale,
      t: (key) => getCopy(locale, key)
    }),
    [locale]
  );

  return {
    providerModelContext,
    providerModels: providerModelContext.providerModels,
    selectedModel: providerModelContext.selectedModel,
    canUseImageMode: providerModelContext.canUseImageMode,
    canContinueEdit: providerModelContext.canContinueEdit,
    isConfigured: providerModelContext.isConfigured,
    supportsCustomSize: providerModelContext.supportsCustomSize,
    resolutionOptions: providerModelContext.resolutionOptions,
    computedSize: providerModelContext.computedSize,
    aspectRatioOptions: providerModelContext.aspectRatioOptions,
    filteredRecords,
    historySelectionContext,
    favoriteRecordIdSet: historySelectionContext.favoriteRecordIdSet,
    selectedHistoryIdSet: historySelectionContext.selectedHistoryIdSet,
    deletingHistoryIdSet: historySelectionContext.deletingHistoryIdSet,
    selectedHistoryRecords: historySelectionContext.selectedHistoryRecords,
    filteredRecordIds: historySelectionContext.filteredRecordIds,
    allRecordIds: historySelectionContext.allRecordIds,
    historyFiltersActive,
    selectedRecordContext,
    selectedRecord: selectedRecordContext.selectedRecord,
    selectedRecordCanContinue: selectedRecordContext.selectedRecordCanContinue,
    activeSourceRecords: selectedRecordContext.activeSourceRecords,
    batchInputSummary,
    batchPrompts: batchInputSummary.prompts,
    batchParseErrorKey: batchInputSummary.parseErrorKey,
    batchHasTooManyPrompts: batchInputSummary.hasTooManyPrompts,
    batchHasTooLongPrompt: batchInputSummary.hasTooLongPrompt,
    batchPromptCounterLabel: batchInputSummary.counterLabel,
    batchProgress,
    batchSucceededCount: batchProgress.succeededCount,
    batchFailedCount: batchProgress.failedCount,
    batchFinishedCount: batchProgress.finishedCount,
    batchPausedOnly: batchProgress.pausedOnly,
    batchProgressPercent: batchProgress.progressPercent,
    batchElapsedLabel,
    allTags,
    visibleTemplates,
    jobMonitorSummary,
    activeJobs: jobMonitorSummary.activeJobs,
    failedJobs: jobMonitorSummary.failedJobs,
    succeededJobs: jobMonitorSummary.succeededJobs,
    finishedJobs: jobMonitorSummary.finishedJobs,
    jobMonitorAlertCount: jobMonitorSummary.alertCount,
    mainClassName,
    jobMonitorLabels,
    lightboxLabels
  };
}
