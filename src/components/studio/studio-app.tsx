"use client";

import {
  useRef,
  useState
} from "react";
import { Wand2 } from "lucide-react";
import { GalleryPanel, getGalleryLabels } from "@/components/studio/gallery";
import { useAdminPanel } from "@/components/studio/hooks/use-admin-panel";
import { useAuthSession } from "@/components/studio/hooks/use-auth-session";
import { useGalleryData } from "@/components/studio/hooks/use-gallery-data";
import { useGenerationRuns } from "@/components/studio/hooks/use-generation-runs";
import { useGenerationActions } from "@/components/studio/hooks/use-generation-actions";
import { useHistoryActions } from "@/components/studio/hooks/use-history-actions";
import { useImageJobs } from "@/components/studio/hooks/use-image-jobs";
import { useLightboxState } from "@/components/studio/hooks/use-lightbox-state";
import { useStudioDerivedState } from "@/components/studio/hooks/use-studio-derived-state";
import { useStudioEffects } from "@/components/studio/hooks/use-studio-effects";
import { useTemplateActions } from "@/components/studio/hooks/use-template-actions";
import { useWorkspaceActions } from "@/components/studio/hooks/use-workspace-actions";
import { useStudioCatalog } from "@/components/studio/hooks/use-studio-catalog";
import { AuthGate } from "@/components/studio/auth-gate";
import { AccountPasswordDialog } from "@/components/studio/account-password-dialog";
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
import { StudioProvider, useStudioState } from "@/components/studio/state/studio-context";
import { getCopy } from "@/components/studio/utils/copy";
import { isUnauthorizedError } from "@/components/studio/utils/api-client";
import {
  getAspectRatioLabel,
  getGenerationDetailLabel,
  getModelLabel,
  getProviderLabel
} from "@/components/studio/utils/format";
import {
  getResetHistoryFiltersState
} from "@/components/studio/utils/studio-view-model";
import {
  DEFAULT_RESOLUTION,
  DEFAULT_SITE_TITLE,
  HISTORY_PAGE_SIZE,
  LIGHTBOX_BUTTON_ZOOM_STEP,
  OFFICIAL_OPENAI_RESOLUTION
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
  const [accountPasswordOpen, setAccountPasswordOpen] = useState(false);
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
    changingPassword,
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setCurrentUser,
    submitAuth,
    logout,
    changePassword,
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
    hasPrevious: lightboxHasPrevious,
    hasNext: lightboxHasNext,
    positionLabel: lightboxPositionLabel,
    open: openLightbox,
    close: closeLightbox,
    resetTransform: resetLightboxTransform,
    enterInspector: enterLightboxInspector,
    leaveInspector: leaveLightboxInspector,
    goPrevious: goPreviousLightboxRecord,
    goNext: goNextLightboxRecord,
    handleImageLoad: handleLightboxImageLoad,
    updateScale: updateLightboxScale,
    handlePointerDown: handleLightboxPointerDown,
    handlePointerMove: handleLightboxPointerMove,
    handlePointerEnd: handleLightboxPointerEnd,
    handleStageDoubleClick: handleLightboxStageDoubleClick
  } = useLightboxState(records);

  const {
    providerModels,
    selectedModel,
    canUseImageMode,
    canContinueEdit,
    isConfigured,
    supportsCustomSize,
    resolutionOptions,
    computedSize,
    aspectRatioOptions,
    filteredRecords,
    favoriteRecordIdSet,
    selectedHistoryIdSet,
    deletingHistoryIdSet,
    selectedHistoryRecords,
    filteredRecordIds,
    allRecordIds,
    historyFiltersActive,
    selectedRecord,
    selectedRecordCanContinue,
    activeSourceRecords,
    batchPrompts,
    batchParseErrorKey,
    batchSucceededCount,
    batchFailedCount,
    batchFinishedCount,
    batchPausedOnly,
    batchProgressPercent,
    batchElapsedLabel,
    batchHasTooManyPrompts,
    batchHasTooLongPrompt,
    batchPromptCounterLabel,
    allTags,
    visibleTemplates,
    activeJobs,
    finishedJobs,
    jobMonitorAlertCount,
    mainClassName,
    jobMonitorLabels,
    lightboxLabels
  } = useStudioDerivedState({
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
    jobMonitorClearedAt: currentUser?.jobMonitorClearedAt,
    locale
  });
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

  function handleUnauthorized(errorOrResponse: unknown) {
    const unauthorized = errorOrResponse instanceof Response
      ? errorOrResponse.status === 401
      : isUnauthorizedError(errorOrResponse);
    if (!unauthorized) return false;

    resetAuthenticatedState(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
    return true;
  }

  function resetHistoryFilters() {
    const next = getResetHistoryFiltersState();
    setHistorySearch(next.historySearch);
    setFavoriteOnly(next.favoriteOnly);
    setHistoryFilter(next.historyFilter);
    setHistoryBatchFilter(next.historyBatchFilter);
    setHistoryProjectFilter(next.historyProjectFilter);
    setHistoryTagFilter(next.historyTagFilter);
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
    pauseActiveBatch,
    resumeActiveBatch,
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
    archiveSelectedImages,
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
        mainClassName={mainClassName}
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
              labels={jobMonitorLabels}
              onToggle={() => {
                setTopbarMenuOpen(false);
                setJobMonitorOpen((current) => !current);
              }}
              onRefreshJobs={() => void loadJobs()}
              onTrackJob={(job) => {
                if (job.status !== "failed") {
                  setJobMonitorOpen(false);
                }
                void trackImageJob(job);
              }}
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
          onResetHistoryFilters={resetHistoryFilters}
          onTopbarMenuOpenChange={setTopbarMenuOpen}
          onAdminOpen={() => {
            window.location.assign("/admin");
          }}
          onLegacyAdminOpen={() => setAdminOpen(true)}
          onChangePasswordOpen={() => setAccountPasswordOpen(true)}
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
            hasPrevious={lightboxHasPrevious}
            hasNext={lightboxHasNext}
            positionLabel={lightboxPositionLabel}
            zoomLabel={lightboxZoomLabel}
            inspectorMeta={lightboxInspectorMeta}
            scale={lightboxScale}
            offset={lightboxOffset}
            providerLabel={getProviderLabel(catalog, lightboxRecord.provider)}
            modelLabel={getModelLabel(catalog, lightboxRecord.provider, lightboxRecord.model)}
            detailLabel={getGenerationDetailLabel(lightboxRecord)}
            copiedPrompt={copiedPromptId === lightboxRecord.id}
            labels={lightboxLabels}
            onClose={closeLightbox}
            onEnterInspector={enterLightboxInspector}
            onLeaveInspector={leaveLightboxInspector}
            onFitToScreen={resetLightboxTransform}
            onOriginalSize={() => updateLightboxScale(1)}
            onZoomOut={() => updateLightboxScale(lightboxScale / LIGHTBOX_BUTTON_ZOOM_STEP)}
            onZoomIn={() => updateLightboxScale(lightboxScale * LIGHTBOX_BUTTON_ZOOM_STEP)}
            onPrevious={goPreviousLightboxRecord}
            onNext={goNextLightboxRecord}
            onCopyPrompt={() => void copyPromptText(lightboxRecord)}
            onImageLoad={handleLightboxImageLoad}
            onPointerDown={handleLightboxPointerDown}
            onPointerMove={handleLightboxPointerMove}
            onPointerEnd={handleLightboxPointerEnd}
            onStageDoubleClick={handleLightboxStageDoubleClick}
          />
        ) : null}
      >
        <AccountPasswordDialog
          open={accountPasswordOpen}
          locale={locale}
          changing={changingPassword}
          t={t}
          onClose={() => setAccountPasswordOpen(false)}
          onChangePassword={changePassword}
          onChanged={showRunNotice}
        />
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
              onPauseBatch={() => void pauseActiveBatch()}
              onResumeBatch={() => void resumeActiveBatch()}
              onChangeImageJobState={(jobId, action) => void changeImageJobState(jobId, action)}
              onRetryBatchItem={(item) => void retryBatchItem(item)}
              onOpenLightbox={(recordId) => openLightbox(recordId, allRecordIds)}
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
            onArchiveSelectedImages={() => void archiveSelectedImages()}
            onExportSelectedImagesZip={() => void exportSelectedImagesZip()}
            onDeleteHistoryImages={(ids) => void deleteHistoryImages(ids)}
            onToggleHistorySelection={toggleHistorySelection}
            onOpenRecord={(recordId) => {
              setSelectedRecordId(recordId);
              openLightbox(recordId, filteredRecordIds);
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
