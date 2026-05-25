"use client";

import {
  useMemo,
  useRef
} from "react";
import { Wand2 } from "lucide-react";
import type { ImageRecord } from "@/lib/types";
import { GalleryPanel, getGalleryLabels } from "@/components/studio/gallery";
import { useAdminPanel } from "@/components/studio/hooks/use-admin-panel";
import { useAuthSession } from "@/components/studio/hooks/use-auth-session";
import { useGalleryData } from "@/components/studio/hooks/use-gallery-data";
import { useGenerationRuns } from "@/components/studio/hooks/use-generation-runs";
import { useGenerationActions } from "@/components/studio/hooks/use-generation-actions";
import { useHistoryActions } from "@/components/studio/hooks/use-history-actions";
import { useImageJobs } from "@/components/studio/hooks/use-image-jobs";
import { useLightboxState } from "@/components/studio/hooks/use-lightbox-state";
import { useStudioEffects } from "@/components/studio/hooks/use-studio-effects";
import { useTemplateActions } from "@/components/studio/hooks/use-template-actions";
import { useWorkspaceActions } from "@/components/studio/hooks/use-workspace-actions";
import { useStudioCatalog } from "@/components/studio/hooks/use-studio-catalog";
import { AuthGate } from "@/components/studio/auth-gate";
import { SettingsDrawer } from "@/components/studio/settings-drawer";
import { AdminDrawer } from "@/components/studio/admin-drawer";
import { Topbar } from "@/components/studio/topbar";
import { GenerationStudio } from "@/components/studio/generation-studio";
import { ComposerPanel } from "@/components/studio/composer-panel";
import { ResultPanel } from "@/components/studio/result-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { JobMonitor } from "@/components/studio/job-monitor";
import { StudioLightbox } from "@/components/studio/lightbox";
import { RawImage } from "@/components/studio/raw-image";
import { isActiveImageJobStatus } from "@/lib/image-job-state";
import { isFinishedImageJobStatus } from "@/lib/job-monitor";
import { StudioProvider, useStudioState } from "@/components/studio/state/studio-context";
import { parseBatchPrompts } from "@/components/studio/utils/batch-prompts";
import { getCopy } from "@/components/studio/utils/copy";
import {
  formatDuration,
  getAspectRatioLabel,
  getGenerationDetailLabel,
  getModelLabel,
  getProviderLabel
} from "@/components/studio/utils/format";
import {
  DEFAULT_RESOLUTION,
  DEFAULT_SITE_TITLE,
  getComputedImageSize,
  HISTORY_PAGE_SIZE,
  LIGHTBOX_BUTTON_ZOOM_STEP,
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH,
  modelSupports,
  OFFICIAL_OPENAI_RESOLUTION,
  RESOLUTION_OPTIONS
} from "@/components/studio/utils/generation-options";

export function StudioApp() {
  return (
    <StudioProvider>
      <StudioAppContent />
    </StudioProvider>
  );
}

function StudioAppContent() {
  const { state, actions } = useStudioState();
  const {
    selectedRecordId,
    activeView,
    studioLayout,
    provider,
    model,
    mode,
    prompt,
    generationInputMode,
    batchPromptText,
    jobMonitorOpen,
    topbarMenuOpen,
    aspectRatio,
    resolution,
    files,
    sourceImageIds,
    historyFilter,
    historyBatchFilter,
    historyProjectFilter,
    historyTagFilter,
    historySearch,
    favoriteOnly,
    favoriteRecordIds,
    selectedHistoryIds,
    deletingHistoryIds,
    favoritesLoaded,
    settingsOpen,
    adminOpen,
    historyFiltersOpen,
    quickMenu,
    loading,
    locale,
    copiedId,
    copiedPromptId,
    newProjectName,
    assignProjectId,
    assignTagsText
  } = state;
  const {
    setSelectedRecordId,
    setActiveView,
    setStudioLayout,
    setProvider,
    setModel,
    setMode,
    setGenerationInputMode,
    setBatchPromptText,
    setJobMonitorOpen,
    setTopbarMenuOpen,
    setAspectRatio,
    setResolution,
    setQuality,
    setInputFidelity,
    setFiles,
    setSourceImageIds,
    setHistoryFilter,
    setHistoryBatchFilter,
    setHistoryProjectFilter,
    setHistoryTagFilter,
    setHistorySearch,
    setFavoriteOnly,
    setFavoriteRecordIds,
    setSelectedHistoryIds,
    setFavoritesLoaded,
    setFilePreviewUrls,
    setSettingsOpen,
    setAdminOpen,
    setHistoryFiltersOpen,
    setQuickMenu,
    setLoading,
    setLocale,
    setError,
    setNewProjectName,
    setAssignProjectId,
    setAssignTagsText,
    setDeletingTemplateId
  } = actions;
  const t = (key: string) => getCopy(locale, key);
  const {
    branding,
    brandLogoUrl,
    setLogoLoadFailed,
    catalog,
    openaiKey,
    setOpenaiKey,
    openaiBaseUrl,
    setOpenaiBaseUrl,
    openaiModel,
    setOpenaiModel,
    userOpenaiKeyConfigured,
    providerSettingsLoaded,
    savingSettings,
    settingsMessage,
    setSettingsMessage,
    resetCatalogState,
    resetProviderSettingsState,
    loadBranding,
    loadCatalog,
    loadProviderSettings,
    saveProviderSettings
  } = useStudioCatalog({
    provider,
    defaultSiteTitle: DEFAULT_SITE_TITLE,
    defaultResolution: DEFAULT_RESOLUTION,
    officialOpenAIResolution: OFFICIAL_OPENAI_RESOLUTION,
    messages: {
      catalogLoadFailed: t("catalogLoadFailed"),
      settingsLoadFailed: t("settingsLoadFailed"),
      settingsSaveFailed: locale === "zh" ? "\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25\u3002" : "Settings could not be saved.",
      keySaved: t("keySaved")
    },
    onUnauthorized: handleUnauthorized,
    onActiveProviderChange: setProvider,
    onCatalogDefaultSelection: (selection) => {
      setProvider(selection.provider);
      if (selection.modelId) {
        setModel(selection.modelId);
        setAspectRatio(selection.defaultAspectRatio);
        setResolution(selection.defaultResolution);
        setQuality(selection.defaultQuality);
        setInputFidelity(selection.defaultInputFidelity);
      }
    }
  });
  const {
    authLoading,
    authMode,
    currentUser,
    registrationOpen,
    authEmail,
    authPassword,
    authError,
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setCurrentUser,
    submitAuth,
    logout,
    resetAuthSession
  } = useAuthSession({
    onAuthenticated: resetProviderSettingsState,
    onLoggedOut: () => resetAuthenticatedState()
  });
  const {
    records,
    setRecords,
    historyNextCursor,
    setHistoryNextCursor,
    historyLoading,
    batches,
    projects,
    templates,
    resetGalleryData,
    loadHistory,
    loadHistoryPage,
    loadBatches,
    loadProjects,
    loadTemplates,
    loadGalleryMeta
  } = useGalleryData({
    pageSize: HISTORY_PAGE_SIZE,
    messages: {
      historyLoadFailed: t("historyLoadFailed"),
      batchesLoadFailed: locale === "zh" ? "\u6279\u6b21\u52a0\u8f7d\u5931\u8d25\u3002" : "Batches could not be loaded.",
      projectsLoadFailed: locale === "zh" ? "\u9879\u76ee\u52a0\u8f7d\u5931\u8d25\u3002" : "Projects could not be loaded.",
      templatesLoadFailed: locale === "zh" ? "\u6a21\u677f\u52a0\u8f7d\u5931\u8d25\u3002" : "Templates could not be loaded.",
      generationFailed: t("generationFailed")
    },
    onUnauthorized: handleUnauthorized,
    onError: setError,
    onSelectFirstRecord: (recordId) => setSelectedRecordId((current) => current || recordId)
  });
  const {
    batchItems,
    setBatchItems,
    batchRunning,
    setBatchRunning,
    batchElapsedSeconds,
    activeBatchId,
    setActiveBatchId,
    jobs,
    jobsLoading,
    jobMonitorClearing,
    jobMonitorFinishedClearing,
    trackingJobId,
    setTrackingJobId,
    jobActionId,
    resetImageJobsState,
    updateBatchTiming,
    resetBatchTiming,
    updateBatchItem,
    mergeJobState,
    mergeBatchJobStates,
    loadJobs,
    clearJobMonitorAlerts,
    clearFinishedJobMonitorItems,
    changeImageJobState: changeImageJobStateOnServer
  } = useImageJobs({
    messages: {
      jobsLoadFailed: locale === "zh" ? "\u4efb\u52a1\u5217\u8868\u52a0\u8f7d\u5931\u8d25\u3002" : "Jobs could not be loaded.",
      clearAlertsFailed: locale === "zh" ? "\u6e05\u7a7a\u63d0\u793a\u5931\u8d25\u3002" : "Could not clear job alerts.",
      clearFinishedFailed: locale === "zh" ? "\u6e05\u7a7a\u5b8c\u6210/\u5931\u8d25\u4efb\u52a1\u5931\u8d25\u3002" : "Could not clear finished jobs.",
      jobKillConfirm: t("jobKillConfirm"),
      jobKillFailed: t("jobKillFailed"),
      generationFailed: t("generationFailed")
    },
    onUnauthorized: handleUnauthorized,
    onError: setError,
    onCurrentUserChange: setCurrentUser
  });
  const {
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
  } = useGenerationRuns();
  const {
    adminOverview,
    setAdminOverview,
    adminMessage,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    deletingUserId,
    platformOpenaiKey,
    setPlatformOpenaiKey,
    platformOpenaiBaseUrl,
    setPlatformOpenaiBaseUrl,
    platformOpenaiModel,
    setPlatformOpenaiModel,
    resetAdminPanelState,
    saveAdminSettings,
    createAdminUser,
    toggleUserDisabled,
    deleteAdminUser,
    savePlatformProvider
  } = useAdminPanel({
    open: adminOpen,
    currentUser,
    locale,
    onUnauthorized: handleUnauthorized,
    onBrandingReload: loadBranding,
    onCatalogReload: loadCatalog
  });
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    recordId: lightboxRecordId,
    record: lightboxRecord,
    mode: lightboxMode,
    scale: lightboxScale,
    offset: lightboxOffset,
    dragging: lightboxDragging,
    stageRef: lightboxInspectorStageRef,
    zoomLabel: lightboxZoomLabel,
    inspectorMeta: lightboxInspectorMeta,
    open: openLightbox,
    close: closeLightbox,
    resetTransform: resetLightboxTransform,
    enterInspector: enterLightboxInspector,
    leaveInspector: leaveLightboxInspector,
    handleImageLoad: handleLightboxImageLoad,
    updateScale: updateLightboxScale,
    handlePointerDown: handleLightboxPointerDown,
    handlePointerMove: handleLightboxPointerMove,
    handlePointerEnd: handleLightboxPointerEnd
  } = useLightboxState(records);

  const providerStatus = useMemo(
    () => catalog?.providers.find((item) => item.provider === provider),
    [catalog, provider]
  );

  const providerModels = useMemo(
    () => catalog?.models.filter((item) => item.provider === provider) ?? [],
    [catalog, provider]
  );

  const selectedModel = useMemo(
    () => providerModels.find((item) => item.modelId === model),
    [model, providerModels]
  );

  const filteredRecords = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const favorites = new Set(favoriteRecordIds);

    return records.filter((record) => {
      if (favoriteOnly && !favorites.has(record.id)) return false;
      if (historyFilter.provider !== "all" && record.provider !== historyFilter.provider) return false;
      if (historyFilter.model !== "all" && record.model !== historyFilter.model) return false;
      if (historyBatchFilter !== "all" && record.batchId !== historyBatchFilter) return false;
      if (historyProjectFilter !== "all" && record.projectId !== historyProjectFilter) return false;
      if (historyTagFilter.trim()) {
        const expectedTag = historyTagFilter.trim().toLowerCase();
        if (!record.tags.some((tag) => tag.toLowerCase().includes(expectedTag))) return false;
      }
      if (!query) return true;

      const searchable = [
        record.prompt,
        record.model,
        record.provider,
        record.size,
        record.aspectRatio,
        record.quality,
        record.tags.join(" "),
        projects.find((project) => project.id === record.projectId)?.name,
        batches.find((batch) => batch.id === record.batchId)?.name,
        getProviderLabel(catalog, record.provider),
        getModelLabel(catalog, record.provider, record.model)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [batches, catalog, favoriteOnly, favoriteRecordIds, historyBatchFilter, historyFilter, historyProjectFilter, historySearch, historyTagFilter, projects, records]);

  const favoriteRecordIdSet = useMemo(() => new Set(favoriteRecordIds), [favoriteRecordIds]);
  const selectedHistoryIdSet = useMemo(() => new Set(selectedHistoryIds), [selectedHistoryIds]);
  const deletingHistoryIdSet = useMemo(() => new Set(deletingHistoryIds), [deletingHistoryIds]);
  const selectedHistoryRecords = useMemo(
    () => filteredRecords.filter((record) => selectedHistoryIdSet.has(record.id)),
    [filteredRecords, selectedHistoryIdSet]
  );

  const historyFiltersActive = Boolean(
    favoriteOnly
    || historySearch.trim()
    || historyFilter.provider !== "all"
    || historyFilter.model !== "all"
    || historyBatchFilter !== "all"
    || historyProjectFilter !== "all"
    || historyTagFilter.trim()
  );

  const selectedRecord = useMemo(
    () => selectedRecordId ? filteredRecords.find((record) => record.id === selectedRecordId) : undefined,
    [filteredRecords, selectedRecordId]
  );

  const selectedRecordModel = useMemo(
    () => selectedRecord
      ? catalog?.models.find((item) => item.provider === selectedRecord.provider && item.modelId === selectedRecord.model)
      : undefined,
    [catalog, selectedRecord]
  );

  const selectedRecordCanContinue = Boolean(
    selectedRecord
    && catalog?.providers.find((item) => item.provider === selectedRecord.provider)?.configured
    && modelSupports(selectedRecordModel, "continue-edit")
  );

  const activeSourceRecords = useMemo(
    () => sourceImageIds
      .map((id) => records.find((record) => record.id === id))
      .filter((record): record is ImageRecord => Boolean(record)),
    [records, sourceImageIds]
  );

  const canUseImageMode = modelSupports(selectedModel, "image-to-image");
  const canContinueEdit = modelSupports(selectedModel, "continue-edit");
  const isConfigured = Boolean(providerStatus?.configured);
  const supportsCustomSize = Boolean(providerStatus?.supportsCustomSize);
  const resolutionOptions = supportsCustomSize ? RESOLUTION_OPTIONS : RESOLUTION_OPTIONS.slice(0, 1);
  const computedSize = useMemo(
    () => getComputedImageSize(aspectRatio, resolution, supportsCustomSize),
    [aspectRatio, resolution, supportsCustomSize]
  );

  const parsedBatchPrompts = useMemo(() => parseBatchPrompts(batchPromptText), [batchPromptText]);
  const batchPrompts = parsedBatchPrompts.prompts;
  const batchParseErrorKey = parsedBatchPrompts.errorKey;
  const batchSucceededCount = batchItems.filter((item) => item.status === "succeeded").length;
  const batchFailedCount = batchItems.filter((item) => item.status === "failed").length;
  const batchPausedCount = batchItems.filter((item) => item.status === "paused").length;
  const batchFinishedCount = batchSucceededCount + batchFailedCount;
  const batchUnfinishedCount = Math.max(0, batchItems.length - batchFinishedCount);
  const batchPausedOnly = batchUnfinishedCount > 0 && batchPausedCount === batchUnfinishedCount;
  const batchProgressPercent = batchItems.length > 0 ? Math.round((batchFinishedCount / batchItems.length) * 100) : 0;
  const batchElapsedLabel = formatDuration(batchElapsedSeconds);
  const batchHasTooManyPrompts = batchPrompts.length > MAX_BATCH_PROMPTS;
  const batchHasTooLongPrompt = batchPrompts.some((item) => item.length > MAX_PROMPT_LENGTH);
  const batchPromptCounterLabel = generationInputMode === "batch"
    ? (batchParseErrorKey ? t(batchParseErrorKey) : `${batchPrompts.length}/${MAX_BATCH_PROMPTS} ${t("batchPrompts")}`)
    : `${prompt.length}/${MAX_PROMPT_LENGTH}`;
  const allTags = useMemo(
    () => Array.from(new Set(records.flatMap((record) => record.tags))).sort((left, right) => left.localeCompare(right)),
    [records]
  );
  const visibleTemplates = useMemo(
    () => templates.filter((template) => template.mode === "universal" || template.mode === mode),
    [mode, templates]
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => isActiveImageJobStatus(job.status)),
    [jobs]
  );
  const failedJobs = useMemo(
    () => jobs.filter((job) => job.status === "failed"),
    [jobs]
  );
  const jobMonitorClearedAt = useMemo(() => {
    if (!currentUser?.jobMonitorClearedAt) return null;

    const clearedAt = new Date(currentUser.jobMonitorClearedAt);
    return Number.isNaN(clearedAt.getTime()) ? null : clearedAt;
  }, [currentUser?.jobMonitorClearedAt]);
  const visibleFailedJobs = useMemo(() => {
    if (!jobMonitorClearedAt) return failedJobs;

    const clearedAtMs = jobMonitorClearedAt.getTime();
    return failedJobs.filter((job) => {
      const failedAt = job.finishedAt ? new Date(job.finishedAt) : new Date(job.createdAt);
      return !Number.isNaN(failedAt.getTime()) && failedAt.getTime() > clearedAtMs;
    });
  }, [failedJobs, jobMonitorClearedAt]);
  const jobMonitorAlertCount = activeJobs.length + visibleFailedJobs.length;
  const succeededJobs = useMemo(
    () => jobs.filter((job) => job.status === "succeeded"),
    [jobs]
  );
  const finishedJobs = useMemo(
    () => jobs.filter((job) => isFinishedImageJobStatus(job.status)),
    [jobs]
  );
  const aspectRatioOptions = selectedModel?.supportedAspectRatios ?? ["auto", "1:1", "3:4", "4:3", "9:16", "16:9"];
  const renderBrandMark = () => (
    <div className={`brand-mark ${brandLogoUrl ? "has-logo" : ""}`}>
      {brandLogoUrl ? (
        <RawImage className="brand-logo" src={brandLogoUrl} alt="" aria-hidden="true" onError={() => setLogoLoadFailed(true)} />
      ) : (
        <Wand2 size={21} />
      )}
    </div>
  );

  function resetAuthenticatedState(message?: string) {
    resetAuthSession(message);
    resetGalleryData();
    resetCatalogState();
    setSelectedRecordId("");
    setSourceImageIds([]);
    setFiles([]);
    setSettingsOpen(false);
    setAdminOpen(false);
    resetAdminPanelState();
    resetGenerationRunsState();
    resetImageJobsState();
    setBatchPromptText("");
    setJobMonitorOpen(false);
    setDeletingTemplateId("");
    setGenerationInputMode("single");
    setLoading(false);
    setError("");
    setActiveView("gallery");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUnauthorized(response: Response) {
    if (response.status !== 401) return false;

    resetAuthenticatedState(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
    return true;
  }

  const {
    loadWorkspaceMeta,
    loadBatchDetail,
    isBatchDetailActive
  } = useWorkspaceActions({
    locale,
    loadJobs,
    loadGalleryMeta,
    handleUnauthorized,
    closeLightbox,
    setBatchItems,
    setBatchRunning,
    setActiveBatchId,
    updateBatchTiming
  });

  useStudioEffects({
    currentUser,
    locale,
    catalog,
    selectedModel,
    providerModels,
    model,
    supportsCustomSize,
    resolution,
    quickMenu,
    settingsOpen,
    providerSettingsLoaded,
    favoritesLoaded,
    favoriteRecordIds,
    files,
    filteredRecords,
    t,
    loadCatalog,
    loadHistory,
    loadWorkspaceMeta,
    loadProviderSettings,
    setStudioLayout,
    setError,
    setSettingsMessage,
    setResolution,
    setQuickMenu,
    setModel,
    setAspectRatio,
    setQuality,
    setInputFidelity,
    setMode,
    setSourceImageIds,
    setFavoriteRecordIds,
    setFavoritesLoaded,
    setFilePreviewUrls,
    setSelectedHistoryIds
  });

  const {
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
    submit,
    retryBatchItem,
    retryFailedBatchItems,
    trackImageJob,
    retryStandaloneJob,
    copyImage,
    copyPromptText,
    loadBatchDetailAndPoll
  } = useGenerationActions({
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
  });

  const {
    toggleFavoriteRecord,
    toggleHistorySelection,
    selectAllVisibleHistory,
    copySelectedImageLinks,
    downloadSelectedImages,
    deleteHistoryImages,
    createProject,
    assignSelectedImages,
    exportSelectedImagesZip,
    clearHistory
  } = useHistoryActions({
    locale,
    filteredRecords,
    selectedHistoryRecords,
    lightboxRecordId,
    t,
    handleUnauthorized,
    closeLightbox,
    loadHistory,
    loadProjects,
    setRecords,
    setHistoryNextCursor
  });

  const {
    applyPromptTemplate,
    saveCurrentPromptAsTemplate,
    deletePromptTemplate
  } = useTemplateActions({
    locale,
    promptRef,
    t,
    handleUnauthorized,
    loadTemplates
  });

  return (
    <AuthGate
      authLoading={authLoading}
      currentUser={currentUser}
      branding={branding}
      brandMark={renderBrandMark()}
      authMode={authMode}
      authEmail={authEmail}
      authPassword={authPassword}
      authError={authError}
      registrationOpen={registrationOpen}
      onSubmitAuth={(event) => void submitAuth(event)}
      onAuthEmailChange={setAuthEmail}
      onAuthPasswordChange={setAuthPassword}
      onAuthModeChange={setAuthMode}
    >
      {currentUser ? (
      <StudioShell
        settingsOpen={settingsOpen}
        adminOpen={adminOpen}
        mainClassName={`main view-${activeView} studio-layout-${studioLayout} ${selectedHistoryIds.length > 0 ? "has-selection-sidebar" : ""}`}
        closeLabel={t("closePreview")}
        onCloseDrawers={() => {
          setSettingsOpen(false);
          setAdminOpen(false);
        }}
        settingsDrawer={(
          <SettingsDrawer
            open={settingsOpen}
            catalog={catalog}
            provider={provider}
            openaiKey={openaiKey}
            openaiBaseUrl={openaiBaseUrl}
            openaiModel={openaiModel}
            userOpenaiKeyConfigured={userOpenaiKeyConfigured}
            savingSettings={savingSettings}
            settingsMessage={settingsMessage}
            locale={locale}
            historyFilter={historyFilter}
            t={t}
            onClose={() => setSettingsOpen(false)}
            onProviderChange={updateProvider}
            onOpenaiKeyChange={setOpenaiKey}
            onOpenaiBaseUrlChange={setOpenaiBaseUrl}
            onOpenaiModelChange={setOpenaiModel}
            onSaveProviderSettings={() => void saveProviderSettings()}
            onHistoryFilterChange={setHistoryFilter}
          />
        )}
        adminDrawer={(
          <AdminDrawer
            open={adminOpen}
            adminOverview={adminOverview}
            adminMessage={adminMessage}
            currentUser={currentUser}
            newUserEmail={newUserEmail}
            newUserPassword={newUserPassword}
            deletingUserId={deletingUserId}
            platformOpenaiKey={platformOpenaiKey}
            platformOpenaiBaseUrl={platformOpenaiBaseUrl}
            platformOpenaiModel={platformOpenaiModel}
            t={t}
            onClose={() => setAdminOpen(false)}
            onAdminOverviewChange={setAdminOverview}
            onSaveAdminSettings={(next) => void saveAdminSettings(next)}
            onPlatformOpenaiKeyChange={setPlatformOpenaiKey}
            onPlatformOpenaiBaseUrlChange={setPlatformOpenaiBaseUrl}
            onPlatformOpenaiModelChange={setPlatformOpenaiModel}
            onSavePlatformProvider={() => void savePlatformProvider()}
            onNewUserEmailChange={setNewUserEmail}
            onNewUserPasswordChange={setNewUserPassword}
            onCreateAdminUser={() => void createAdminUser()}
            onToggleUserDisabled={(user) => void toggleUserDisabled(user)}
            onDeleteAdminUser={(user) => void deleteAdminUser(user)}
          />
        )}
        topbar={(
          <Topbar
          activeView={activeView}
          brandMark={renderBrandMark()}
          siteTitle={branding.siteTitle}
          providerLabel={getProviderLabel(catalog, provider)}
          modelLabel={selectedModel?.label ?? model}
          catalog={catalog}
          currentUser={currentUser}
          locale={locale}
          historySearch={historySearch}
          favoriteOnly={favoriteOnly}
          historyFiltersOpen={historyFiltersOpen}
          historyFiltersActive={historyFiltersActive}
          historyFilter={historyFilter}
          historyBatchFilter={historyBatchFilter}
          historyProjectFilter={historyProjectFilter}
          historyTagFilter={historyTagFilter}
          batches={batches}
          projects={projects}
          allTags={allTags}
          topbarMenuOpen={topbarMenuOpen}
          historyLoading={historyLoading}
          recordsLength={records.length}
          hasHistoryNextCursor={Boolean(historyNextCursor)}
          runNotice={runNotice}
          jobMonitor={(
            <JobMonitor
              open={jobMonitorOpen}
              catalog={catalog}
              jobs={jobs}
              activeCount={activeJobs.length}
              alertCount={jobMonitorAlertCount}
              finishedCount={finishedJobs.length}
              jobsLoading={jobsLoading}
              historyLoading={historyLoading}
              clearingAlerts={jobMonitorClearing}
              clearingFinished={jobMonitorFinishedClearing}
              trackingJobId={trackingJobId}
              jobActionId={jobActionId}
              labels={{
                title: locale === "zh" ? "\u4efb\u52a1\u76d1\u63a7" : "Job monitor",
                activity: locale === "zh" ? "\u6d3b\u52a8\u4e2d\u5fc3" : "Activity",
                summary: locale === "zh"
                  ? `${activeJobs.length} \u6392\u961f/\u8fd0\u884c / ${failedJobs.length} \u5931\u8d25 / ${succeededJobs.length} \u5b8c\u6210`
                  : `${activeJobs.length} active / ${failedJobs.length} failed / ${succeededJobs.length} done`,
                refreshJobs: locale === "zh" ? "\u5237\u65b0\u4efb\u52a1" : "Refresh jobs",
                batchPending: t("batchPending"),
                batchPaused: t("batchPaused"),
                batchRunning: t("batchRunning"),
                batchSucceeded: t("batchSucceeded"),
                batchFailed: t("batchFailed"),
                batchPause: t("batchPause"),
                batchResume: t("batchResume"),
                jobKill: t("jobKill"),
                batchRetry: t("batchRetry"),
                loadingMore: t("loadingMore"),
                batch: locale === "zh" ? "\u6253\u5f00\u6279\u6b21" : "Batch",
                track: locale === "zh" ? "\u8ffd\u8e2a" : "Track",
                view: locale === "zh" ? "\u67e5\u770b" : "View",
                noRecentJobs: locale === "zh" ? "\u6682\u65e0\u6700\u8fd1\u4efb\u52a1\u3002" : "No recent jobs.",
                clearFinished: locale === "zh" ? "\u6e05\u7a7a\u5b8c\u6210/\u5931\u8d25" : "Clear finished",
                clearAlerts: locale === "zh" ? "\u6e05\u7a7a\u63d0\u793a" : "Clear alerts",
                refreshGallery: locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"
              }}
              onToggle={() => {
                setTopbarMenuOpen(false);
                setJobMonitorOpen((current) => !current);
              }}
              onRefreshJobs={() => void loadJobs()}
              onTrackJob={(job) => void trackImageJob(job)}
              onChangeJobState={(jobId, action) => void changeImageJobState(jobId, action)}
              onRetryStandaloneJob={(job) => void retryStandaloneJob(job)}
              onClearFinished={() => void clearFinishedJobMonitorItems()}
              onClearAlerts={() => void clearJobMonitorAlerts()}
              onRefreshGallery={() => void loadHistory()}
            />
          )}
          t={t}
          onHistorySearchChange={setHistorySearch}
          onFavoriteOnlyChange={setFavoriteOnly}
          onHistoryFiltersOpenChange={setHistoryFiltersOpen}
          onHistoryFilterChange={setHistoryFilter}
          onHistoryBatchFilterChange={setHistoryBatchFilter}
          onHistoryProjectFilterChange={setHistoryProjectFilter}
          onHistoryTagFilterChange={setHistoryTagFilter}
          onResetHistoryFilters={() => {
            setHistorySearch("");
            setFavoriteOnly(false);
            setHistoryFilter({ provider: "all", model: "all" });
            setHistoryBatchFilter("all");
            setHistoryProjectFilter("all");
            setHistoryTagFilter("");
          }}
          onTopbarMenuOpenChange={setTopbarMenuOpen}
          onAdminOpen={() => setAdminOpen(true)}
          onLocaleChange={setLocale}
          onOpenGenerationStudio={openGenerationStudio}
          onRefreshGallery={() => void loadHistory({ selectFirst: false })}
          onSettingsOpen={() => setSettingsOpen(true)}
          onJobMonitorClose={() => setJobMonitorOpen(false)}
          onLogout={() => void logout()}
          onClearHistory={() => void clearHistory()}
        />
        )}
        lightbox={lightboxRecord ? (
          <StudioLightbox
            record={lightboxRecord}
            mode={lightboxMode}
            isDragging={lightboxDragging}
            stageRef={lightboxInspectorStageRef}
            zoomLabel={lightboxZoomLabel}
            inspectorMeta={lightboxInspectorMeta}
            scale={lightboxScale}
            offset={lightboxOffset}
            providerLabel={getProviderLabel(catalog, lightboxRecord.provider)}
            modelLabel={getModelLabel(catalog, lightboxRecord.provider, lightboxRecord.model)}
            detailLabel={getGenerationDetailLabel(lightboxRecord)}
            copiedPrompt={copiedPromptId === lightboxRecord.id}
            labels={{
              imagePreview: t("imagePreview"),
              closePreview: t("closePreview"),
              download: t("download"),
              preview: t("preview"),
              promptUsed: t("promptUsed"),
              copied: t("copied"),
              copyPrompt: t("copyPrompt"),
              zoomOut: locale === "zh" ? "\u7f29\u5c0f" : "Zoom out",
              resetZoom: locale === "zh" ? "\u91cd\u7f6e\u7f29\u653e" : "Reset zoom",
              zoomIn: locale === "zh" ? "\u653e\u5927" : "Zoom in"
            }}
            onClose={closeLightbox}
            onEnterInspector={enterLightboxInspector}
            onLeaveInspector={leaveLightboxInspector}
            onResetZoom={resetLightboxTransform}
            onZoomOut={() => updateLightboxScale(lightboxScale / LIGHTBOX_BUTTON_ZOOM_STEP)}
            onZoomIn={() => updateLightboxScale(lightboxScale * LIGHTBOX_BUTTON_ZOOM_STEP)}
            onCopyPrompt={() => void copyPromptText(lightboxRecord)}
            onImageLoad={handleLightboxImageLoad}
            onPointerDown={handleLightboxPointerDown}
            onPointerMove={handleLightboxPointerMove}
            onPointerEnd={handleLightboxPointerEnd}
          />
        ) : null}
      >
        <GenerationStudio
          activeView={activeView}
          loading={loading}
          locale={locale}
          isConfigured={isConfigured}
          t={t}
          onBackToGallery={returnToGallery}
        >
          <ComposerPanel
            catalog={catalog}
            selectedModel={selectedModel}
            selectedRecord={selectedRecord}
            providerModels={providerModels}
            activeSourceRecords={activeSourceRecords}
            visibleTemplates={visibleTemplates}
            resolutionOptions={resolutionOptions}
            aspectRatioOptions={aspectRatioOptions}
            canUseImageMode={canUseImageMode}
            canContinueEdit={canContinueEdit}
            supportsCustomSize={supportsCustomSize}
            isConfigured={isConfigured}
            batchItems={batchItems}
            batchRunning={batchRunning}
            batchFinishedCount={batchFinishedCount}
            batchProgressPercent={batchProgressPercent}
            batchElapsedLabel={batchElapsedLabel}
            batchPromptCounterLabel={batchPromptCounterLabel}
            batchParseErrorKey={batchParseErrorKey}
            batchHasTooManyPrompts={batchHasTooManyPrompts}
            batchHasTooLongPrompt={batchHasTooLongPrompt}
            pendingGeneration={pendingGeneration}
            activeStudioRunIsRunning={activeStudioRunIsRunning}
            runningBackgroundRunCount={runningBackgroundRuns.length}
            elapsedSeconds={elapsedSeconds}
            promptRef={promptRef}
            fileInputRef={fileInputRef}
            t={t}
            onSubmit={(event) => void submit(event)}
            onBackToGallery={returnToGallery}
            onClearOutputResult={clearOutputResult}
            onToggleStudioLayout={toggleStudioLayout}
            onUpdateGenerationInputMode={updateGenerationInputMode}
            onUpdateMode={updateMode}
            onChooseModel={chooseModel}
            onChooseAspectRatio={chooseAspectRatio}
            onChooseResolution={chooseResolution}
            onChooseQuality={chooseQuality}
            onChooseInputFidelity={chooseInputFidelity}
            onInsertBatchPromptTemplate={insertBatchPromptTemplate}
            onSaveCurrentPromptAsTemplate={() => void saveCurrentPromptAsTemplate()}
            onApplyPromptTemplate={applyPromptTemplate}
            onDeletePromptTemplate={(template) => void deletePromptTemplate(template)}
            onClearSource={clearSource}
            onRemoveFile={removeFile}
            onReferenceDrag={handleReferenceDrag}
            onReferenceDrop={handleReferenceDrop}
            onUpdateFiles={updateFiles}
            onKeepActiveRunInStudio={keepActiveRunInStudio}
            onSendActiveRunToBackground={() => sendActiveRunToBackground()}
          />

          {activeView === "studio" && (
            <ResultPanel
              catalog={catalog}
              selectedModel={selectedModel}
              selectedRecord={selectedRecord}
              selectedRecordCanContinue={selectedRecordCanContinue}
              isConfigured={isConfigured}
              batchItems={batchItems}
              batchRunning={batchRunning}
              batchFinishedCount={batchFinishedCount}
              batchSucceededCount={batchSucceededCount}
              batchFailedCount={batchFailedCount}
              batchPausedOnly={batchPausedOnly}
              batchElapsedLabel={batchElapsedLabel}
              batchProgressPercent={batchProgressPercent}
              activeBatchId={activeBatchId}
              pendingGeneration={pendingGeneration}
              elapsedSeconds={elapsedSeconds}
              jobActionId={jobActionId}
              trackingJobId={trackingJobId}
              t={t}
              onLoadBatchDetail={(batchId) => void loadBatchDetailAndPoll(batchId, { showInStudio: true, pollActive: true })}
              onRetryFailedBatchItems={() => void retryFailedBatchItems()}
              onChangeImageJobState={(jobId, action) => void changeImageJobState(jobId, action)}
              onRetryBatchItem={(item) => void retryBatchItem(item)}
              onOpenLightbox={openLightbox}
              onStartContinueEdit={startContinueEdit}
              onCopyImage={(record) => void copyImage(record)}
              onCopyPromptText={(record) => void copyPromptText(record)}
            />
          )}

          <GalleryPanel
            catalog={catalog}
            batches={batches}
            projects={projects}
            records={filteredRecords}
            selectedRecordId={selectedRecordId}
            favoriteRecordIdSet={favoriteRecordIdSet}
            selectedHistoryIds={selectedHistoryIds}
            selectedHistoryIdSet={selectedHistoryIdSet}
            deletingHistoryIdSet={deletingHistoryIdSet}
            historyFilter={historyFilter}
            historyBatchFilter={historyBatchFilter}
            historyProjectFilter={historyProjectFilter}
            historyTagFilter={historyTagFilter}
            historySearch={historySearch}
            favoriteOnly={favoriteOnly}
            historyFiltersOpen={historyFiltersOpen}
            historyFiltersActive={historyFiltersActive}
            historyNextCursor={historyNextCursor}
            historyLoading={historyLoading}
            newProjectName={newProjectName}
            assignProjectId={assignProjectId}
            assignTagsText={assignTagsText}
            copiedId={copiedId}
            labels={getGalleryLabels(locale, t)}
            getAspectRatioLabel={getAspectRatioLabel}
            canContinueRecord={canContinueRecord}
            onOpenGenerationStudio={openGenerationStudio}
            onToggleFavoriteOnly={() => setFavoriteOnly((current) => !current)}
            onHistorySearchChange={setHistorySearch}
            onHistoryProviderChange={(nextProvider) => setHistoryFilter((current) => ({ ...current, provider: nextProvider, model: "all" }))}
            onHistoryModelChange={(nextModel) => setHistoryFilter((current) => ({ ...current, model: nextModel }))}
            onHistoryBatchFilterChange={setHistoryBatchFilter}
            onHistoryProjectFilterChange={setHistoryProjectFilter}
            onHistoryTagFilterChange={setHistoryTagFilter}
            onToggleHistoryFilters={() => setHistoryFiltersOpen((current) => !current)}
            onResetFilters={() => {
              setHistorySearch("");
              setFavoriteOnly(false);
              setHistoryFilter({ provider: "all", model: "all" });
              setHistoryBatchFilter("all");
              setHistoryProjectFilter("all");
              setHistoryTagFilter("");
            }}
            onClearSelection={() => setSelectedHistoryIds([])}
            onNewProjectNameChange={setNewProjectName}
            onCreateProject={() => void createProject()}
            onAssignProjectIdChange={setAssignProjectId}
            onAssignTagsTextChange={setAssignTagsText}
            onAssignSelectedImages={() => void assignSelectedImages()}
            onSelectAllVisibleHistory={selectAllVisibleHistory}
            onCopySelectedImageLinks={() => void copySelectedImageLinks()}
            onDownloadSelectedImages={downloadSelectedImages}
            onExportSelectedImagesZip={() => void exportSelectedImagesZip()}
            onDeleteHistoryImages={(ids) => void deleteHistoryImages(ids)}
            onToggleHistorySelection={toggleHistorySelection}
            onOpenRecord={(recordId) => {
              setSelectedRecordId(recordId);
              openLightbox(recordId);
            }}
            onToggleFavoriteRecord={toggleFavoriteRecord}
            onStartContinueEdit={startContinueEdit}
            onCopyImage={(record) => void copyImage(record)}
            onLoadHistoryPage={() => void loadHistoryPage()}
          />
        </GenerationStudio>
      </StudioShell>
      ) : null}
    </AuthGate>
  );
}
