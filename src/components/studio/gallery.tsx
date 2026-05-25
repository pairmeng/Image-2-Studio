import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FolderPlus,
  ImagePlus,
  Loader2,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
  X
} from "lucide-react";
import type { CatalogResponse, ImageBatchResponse, ImageProjectResponse, ImageRecord } from "@/lib/types";
import type { ProviderId } from "@/lib/models";
import { RawImage } from "./raw-image";

type GalleryLocale = "en" | "zh";

export type GalleryHistoryFilter = {
  provider: "all" | ProviderId;
  model: "all" | string;
};

type GalleryCopyKey =
  | "history"
  | "provider"
  | "allProviders"
  | "model"
  | "allModels"
  | "imagePreview"
  | "editThisImage"
  | "copyLink"
  | "download"
  | "open"
  | "loadingMore"
  | "loadMore"
  | "historyEmpty";

type GalleryLabels = {
  history: string;
  imageGallery: string;
  createImage: string;
  showFavorites: string;
  searchPlaceholder: string;
  searchHistory: string;
  filters: string;
  provider: string;
  allProviders: string;
  model: string;
  allModels: string;
  batch: string;
  allBatches: string;
  project: string;
  allProjects: string;
  tag: string;
  resetFilters: string;
  bulkActions: string;
  selected: string;
  clearSelection: string;
  newProject: string;
  createProject: string;
  archive: string;
  organize: string;
  noProject: string;
  tagsPlaceholder: string;
  actions: string;
  selectVisible: string;
  copyLinks: string;
  download: string;
  deleteSelected: string;
  deselect: string;
  select: string;
  viewCurrentImage: string;
  imagePreview: string;
  projectFallback: string;
  batchFallback: string;
  favorite: string;
  editThisImage: string;
  copyLink: string;
  open: string;
  delete: string;
  loadingMore: string;
  loadMore: string;
  noMatches: string;
  historyEmpty: string;
};

type GalleryPanelProps = {
  catalog: CatalogResponse | null;
  batches: ImageBatchResponse[];
  projects: ImageProjectResponse[];
  records: ImageRecord[];
  selectedRecordId: string;
  favoriteRecordIdSet: Set<string>;
  selectedHistoryIds: string[];
  selectedHistoryIdSet: Set<string>;
  deletingHistoryIdSet: Set<string>;
  historyFilter: GalleryHistoryFilter;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
  historySearch: string;
  favoriteOnly: boolean;
  historyFiltersOpen: boolean;
  historyFiltersActive: boolean;
  historyNextCursor?: string;
  historyLoading: boolean;
  newProjectName: string;
  assignProjectId: string;
  assignTagsText: string;
  copiedId: string;
  labels: GalleryLabels;
  getAspectRatioLabel: (value: string) => string;
  canContinueRecord: (record: ImageRecord) => boolean;
  onOpenGenerationStudio: () => void;
  onToggleFavoriteOnly: () => void;
  onHistorySearchChange: (value: string) => void;
  onHistoryProviderChange: (value: GalleryHistoryFilter["provider"]) => void;
  onHistoryModelChange: (value: string) => void;
  onHistoryBatchFilterChange: (value: string) => void;
  onHistoryProjectFilterChange: (value: string) => void;
  onHistoryTagFilterChange: (value: string) => void;
  onToggleHistoryFilters: () => void;
  onResetFilters: () => void;
  onClearSelection: () => void;
  onNewProjectNameChange: (value: string) => void;
  onCreateProject: () => void;
  onAssignProjectIdChange: (value: string) => void;
  onAssignTagsTextChange: (value: string) => void;
  onAssignSelectedImages: () => void;
  onSelectAllVisibleHistory: () => void;
  onCopySelectedImageLinks: () => void;
  onDownloadSelectedImages: () => void;
  onExportSelectedImagesZip: () => void;
  onDeleteHistoryImages: (ids: string[]) => void;
  onToggleHistorySelection: (id: string) => void;
  onOpenRecord: (id: string) => void;
  onToggleFavoriteRecord: (id: string) => void;
  onStartContinueEdit: (record: ImageRecord) => void;
  onCopyImage: (record: ImageRecord) => void;
  onLoadHistoryPage: () => void;
};

export function getGalleryLabels(locale: GalleryLocale, t: (key: GalleryCopyKey) => string): GalleryLabels {
  return {
    history: t("history"),
    imageGallery: locale === "zh" ? "\u56fe\u7247\u56fe\u5e93" : "Image gallery",
    createImage: locale === "zh" ? "\u751f\u6210\u65b0\u56fe" : "Create image",
    showFavorites: locale === "zh" ? "\u53ea\u770b\u6536\u85cf" : "Show favorites",
    searchPlaceholder: locale === "zh" ? "\u641c\u7d22\u63d0\u793a\u8bcd\u3001\u6a21\u578b\u3001\u5c3a\u5bf8..." : "Search prompts, models, sizes...",
    searchHistory: locale === "zh" ? "\u641c\u7d22\u5386\u53f2" : "Search history",
    filters: locale === "zh" ? "\u7b5b\u9009" : "Filters",
    provider: t("provider"),
    allProviders: t("allProviders"),
    model: t("model"),
    allModels: t("allModels"),
    batch: locale === "zh" ? "\u6279\u6b21" : "Batch",
    allBatches: locale === "zh" ? "\u5168\u90e8\u6279\u6b21" : "All batches",
    project: locale === "zh" ? "\u9879\u76ee" : "Project",
    allProjects: locale === "zh" ? "\u5168\u90e8\u9879\u76ee" : "All projects",
    tag: locale === "zh" ? "\u6807\u7b7e" : "Tag",
    resetFilters: locale === "zh" ? "\u91cd\u7f6e\u7b5b\u9009" : "Reset filters",
    bulkActions: locale === "zh" ? "\u6279\u91cf\u64cd\u4f5c" : "Bulk actions",
    selected: locale === "zh" ? "\u5df2\u9009\u62e9" : "selected",
    clearSelection: locale === "zh" ? "\u6e05\u7a7a\u9009\u62e9" : "Clear selection",
    newProject: locale === "zh" ? "\u65b0\u9879\u76ee" : "New project",
    createProject: locale === "zh" ? "\u521b\u5efa\u9879\u76ee" : "Create project",
    archive: locale === "zh" ? "\u5f52\u6863" : "Organize",
    organize: locale === "zh" ? "\u6574\u7406" : "Organize",
    noProject: locale === "zh" ? "\u4e0d\u5206\u914d\u9879\u76ee" : "No project",
    tagsPlaceholder: locale === "zh" ? "\u6807\u7b7e\uff0c\u9017\u53f7\u5206\u9694" : "Tags, comma-separated",
    actions: locale === "zh" ? "\u64cd\u4f5c" : "Actions",
    selectVisible: locale === "zh" ? "\u5168\u9009\u53ef\u89c1" : "Select visible",
    copyLinks: locale === "zh" ? "\u590d\u5236\u94fe\u63a5" : "Copy links",
    download: t("download"),
    deleteSelected: locale === "zh" ? "\u5220\u9664\u6240\u9009" : "Delete selected",
    deselect: locale === "zh" ? "\u53d6\u6d88\u9009\u62e9" : "Deselect",
    select: locale === "zh" ? "\u9009\u62e9" : "Select",
    viewCurrentImage: locale === "zh" ? "\u67e5\u770b\u5f53\u524d\u56fe\u7247" : "View current image",
    imagePreview: t("imagePreview"),
    projectFallback: "Project",
    batchFallback: "Batch",
    favorite: locale === "zh" ? "\u6536\u85cf" : "Favorite",
    editThisImage: t("editThisImage"),
    copyLink: t("copyLink"),
    open: t("open"),
    delete: locale === "zh" ? "\u5220\u9664" : "Delete",
    loadingMore: t("loadingMore"),
    loadMore: t("loadMore"),
    noMatches: locale === "zh" ? "\u6ca1\u6709\u5339\u914d\u7684\u5386\u53f2\u8bb0\u5f55\u3002" : "No matching history records.",
    historyEmpty: t("historyEmpty")
  };
}

export function GalleryPanel({
  catalog,
  batches,
  projects,
  records,
  selectedRecordId,
  favoriteRecordIdSet,
  selectedHistoryIds,
  selectedHistoryIdSet,
  deletingHistoryIdSet,
  historyFilter,
  historyBatchFilter,
  historyProjectFilter,
  historyTagFilter,
  historySearch,
  favoriteOnly,
  historyFiltersOpen,
  historyFiltersActive,
  historyNextCursor,
  historyLoading,
  newProjectName,
  assignProjectId,
  assignTagsText,
  copiedId,
  labels,
  getAspectRatioLabel,
  canContinueRecord,
  onOpenGenerationStudio,
  onToggleFavoriteOnly,
  onHistorySearchChange,
  onHistoryProviderChange,
  onHistoryModelChange,
  onHistoryBatchFilterChange,
  onHistoryProjectFilterChange,
  onHistoryTagFilterChange,
  onToggleHistoryFilters,
  onResetFilters,
  onClearSelection,
  onNewProjectNameChange,
  onCreateProject,
  onAssignProjectIdChange,
  onAssignTagsTextChange,
  onAssignSelectedImages,
  onSelectAllVisibleHistory,
  onCopySelectedImageLinks,
  onDownloadSelectedImages,
  onExportSelectedImagesZip,
  onDeleteHistoryImages,
  onToggleHistorySelection,
  onOpenRecord,
  onToggleFavoriteRecord,
  onStartContinueEdit,
  onCopyImage,
  onLoadHistoryPage
}: GalleryPanelProps) {
  return (
    <section className="gallery-panel">
      <div className="gallery-hero">
        <div>
          <p className="section-label">{labels.history}</p>
          <h1>{labels.imageGallery}</h1>
        </div>
        <button className="primary-button gallery-create-button" type="button" onClick={onOpenGenerationStudio}>
          <ImagePlus size={18} />
          {labels.createImage}
        </button>
      </div>

      <div className="history-panel">
        <div className={`history-toolbar history-toolbar-inline ${historyFiltersOpen ? "is-open" : ""}`} role="search">
          <button
            className={`icon-button history-favorite-filter ${favoriteOnly ? "is-active" : ""}`}
            type="button"
            title={labels.showFavorites}
            aria-pressed={favoriteOnly}
            onClick={onToggleFavoriteOnly}
          >
            <Star size={18} fill={favoriteOnly ? "currentColor" : "none"} />
          </button>
          <label className="history-search-field">
            <Search size={18} />
            <input
              value={historySearch}
              onChange={(event) => onHistorySearchChange(event.target.value)}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchHistory}
            />
          </label>
          <button
            className={`icon-button history-filter-toggle ${historyFiltersOpen ? "is-active" : ""}`}
            type="button"
            title={labels.filters}
            aria-expanded={historyFiltersOpen}
            onClick={onToggleHistoryFilters}
          >
            <Settings2 size={18} />
          </button>
          <div className="history-filter-drawer" hidden={!historyFiltersOpen}>
            <select
              className="history-filter-select"
              value={historyFilter.provider}
              onChange={(event) => onHistoryProviderChange(event.target.value as GalleryHistoryFilter["provider"])}
              aria-label={labels.provider}
            >
              <option value="all">{labels.allProviders}</option>
              {catalog?.providers.map((item) => (
                <option key={item.provider} value={item.provider}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="history-filter-select"
              value={historyFilter.model}
              onChange={(event) => onHistoryModelChange(event.target.value)}
              aria-label={labels.model}
            >
              <option value="all">{labels.allModels}</option>
              {catalog?.models
                .filter((item) => historyFilter.provider === "all" || item.provider === historyFilter.provider)
                .map((item) => (
                  <option key={`${item.provider}:${item.modelId}`} value={item.modelId}>
                    {item.label}
                  </option>
                ))}
            </select>
            <select
              className="history-filter-select"
              value={historyBatchFilter}
              onChange={(event) => onHistoryBatchFilterChange(event.target.value)}
              aria-label={labels.batch}
            >
              <option value="all">{labels.allBatches}</option>
              {batches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className="history-filter-select"
              value={historyProjectFilter}
              onChange={(event) => onHistoryProjectFilterChange(event.target.value)}
              aria-label={labels.project}
            >
              <option value="all">{labels.allProjects}</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              className="history-filter-select"
              value={historyTagFilter}
              onChange={(event) => onHistoryTagFilterChange(event.target.value)}
              list="history-tags"
              placeholder={labels.tag}
              aria-label={labels.tag}
            />
          </div>
          {historyFiltersActive && (
            <button
              className="icon-button history-reset-button"
              type="button"
              title={labels.resetFilters}
              onClick={onResetFilters}
            >
              <X size={17} />
            </button>
          )}
        </div>
        {selectedHistoryIds.length > 0 && (
          <div className="history-selection-bar">
            <div className="selection-sidebar-head">
              <span className="selection-count-badge">{selectedHistoryIds.length}</span>
              <div>
                <p className="section-label">{labels.bulkActions}</p>
                <strong>{labels.selected}</strong>
              </div>
              <button className="icon-button history-reset-button" type="button" title={labels.clearSelection} onClick={onClearSelection}>
                <X size={16} />
              </button>
            </div>
            <div className="history-selection-actions">
              <div className="selection-action-group">
                <p className="selection-group-label">{labels.project}</p>
                <div className="selection-inline-row">
                  <input
                    className="selection-field"
                    value={newProjectName}
                    onChange={(event) => onNewProjectNameChange(event.target.value)}
                    placeholder={labels.newProject}
                  />
                  <button className="icon-button selection-icon-action" type="button" title={labels.createProject} onClick={onCreateProject}>
                    <FolderPlus size={16} />
                  </button>
                </div>
              </div>
              <div className="selection-action-group">
                <p className="selection-group-label">{labels.archive}</p>
                <select className="selection-field" value={assignProjectId} onChange={(event) => onAssignProjectIdChange(event.target.value)}>
                  <option value="">{labels.noProject}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <input
                  className="selection-field"
                  value={assignTagsText}
                  onChange={(event) => onAssignTagsTextChange(event.target.value)}
                  placeholder={labels.tagsPlaceholder}
                />
                <button className="text-button tiny" type="button" onClick={onAssignSelectedImages}>
                  <Tags size={14} />
                  {labels.organize}
                </button>
              </div>
              <div className="selection-action-group">
                <p className="selection-group-label">{labels.actions}</p>
                <div className="selection-action-grid">
                  <button className="text-button tiny" type="button" onClick={onSelectAllVisibleHistory}>
                    <Check size={14} />
                    {labels.selectVisible}
                  </button>
                  <button className="text-button tiny" type="button" onClick={onCopySelectedImageLinks}>
                    <Copy size={14} />
                    {labels.copyLinks}
                  </button>
                  <button className="text-button tiny" type="button" onClick={onDownloadSelectedImages}>
                    <Download size={14} />
                    {labels.download}
                  </button>
                  <button className="text-button tiny" type="button" onClick={onExportSelectedImagesZip}>
                    <Archive size={14} />
                    ZIP
                  </button>
                </div>
              </div>
              <button
                className="text-button tiny danger-button selection-danger-action"
                type="button"
                disabled={selectedHistoryIds.some((id) => deletingHistoryIdSet.has(id))}
                onClick={() => onDeleteHistoryImages(selectedHistoryIds)}
              >
                <Trash2 size={14} />
                {labels.deleteSelected}
              </button>
            </div>
          </div>
        )}
        {records.length > 0 ? (
          <>
            <div className="history-grid">
              {records.map((record) => {
                const isFavorite = favoriteRecordIdSet.has(record.id);
                const isPicked = selectedHistoryIdSet.has(record.id);
                const isDeleting = deletingHistoryIdSet.has(record.id);
                const canContinue = canContinueRecord(record);

                return (
                  <article
                    className={`history-thumb ${selectedRecordId === record.id ? "is-selected" : ""} ${isFavorite ? "is-favorite" : ""} ${isPicked ? "is-picked" : ""}`}
                    key={record.id}
                  >
                    <button
                      className={`history-select-toggle ${isPicked ? "is-active" : ""}`}
                      type="button"
                      title={isPicked ? labels.deselect : labels.select}
                      aria-pressed={isPicked}
                      onClick={() => onToggleHistorySelection(record.id)}
                    >
                      {isPicked && <Check size={14} />}
                    </button>
                    <button
                      className="history-card-main history-card-preview"
                      data-testid="history-card-preview"
                      type="button"
                      onClick={() => onOpenRecord(record.id)}
                      title={record.prompt}
                      aria-label={labels.viewCurrentImage}
                    >
                      <div className="history-card-image">
                        <RawImage src={record.thumbnailUrl ?? record.imageUrl} alt={labels.imagePreview} loading="lazy" />
                        <div className="history-image-badges">
                          <span>{record.aspectRatio ? getAspectRatioLabel(record.aspectRatio) : "-"}</span>
                          <span>{record.size || "-"}</span>
                          {record.projectId && <span>{projects.find((project) => project.id === record.projectId)?.name ?? labels.projectFallback}</span>}
                          {record.batchId && <span>{batches.find((batch) => batch.id === record.batchId)?.name ?? labels.batchFallback}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="history-card-actions">
                      <button
                        className={`history-icon-action ${isFavorite ? "is-active" : ""}`}
                        type="button"
                        title={labels.favorite}
                        aria-pressed={isFavorite}
                        disabled={isDeleting}
                        onClick={() => onToggleFavoriteRecord(record.id)}
                      >
                        <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                      </button>
                      <button
                        className="history-icon-action"
                        type="button"
                        title={labels.editThisImage}
                        disabled={!canContinue || isDeleting}
                        onClick={() => onStartContinueEdit(record)}
                      >
                        <ImagePlus size={16} />
                      </button>
                      <button className="history-icon-action" type="button" title={labels.copyLink} disabled={isDeleting} onClick={() => onCopyImage(record)}>
                        {copiedId === record.id ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <a className={`history-icon-action ${isDeleting ? "is-disabled" : ""}`} title={labels.download} href={record.imageUrl} download aria-disabled={isDeleting}>
                        <Download size={16} />
                      </a>
                      <a className={`history-icon-action ${isDeleting ? "is-disabled" : ""}`} title={labels.open} href={record.imageUrl} target="_blank" rel="noreferrer" aria-disabled={isDeleting}>
                        <ExternalLink size={16} />
                      </a>
                      <button className="history-icon-action is-danger" type="button" title={labels.delete} disabled={isDeleting} onClick={() => onDeleteHistoryImages([record.id])}>
                        {isDeleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {historyNextCursor && (
              <button
                className="text-button history-load-more"
                disabled={historyLoading}
                type="button"
                onClick={onLoadHistoryPage}
              >
                {historyLoading ? <Loader2 className="spin" size={15} /> : <ChevronDown size={15} />}
                {historyLoading ? labels.loadingMore : labels.loadMore}
              </button>
            )}
          </>
        ) : historyLoading ? (
          <p className="history-empty">{labels.loadingMore}</p>
        ) : historyFiltersActive ? (
          <p className="history-empty">{labels.noMatches}</p>
        ) : (
          <p className="history-empty">{labels.historyEmpty}</p>
        )}
      </div>
    </section>
  );
}
