import type { DragEvent, FormEvent, RefObject } from "react";
import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { CatalogResponse, ImageRecord, PromptTemplateResponse } from "@/lib/types";
import type { ImageMode } from "@/lib/models";
import { modelSupports } from "@/components/studio/utils/generation-options";
import type { PendingGeneration } from "@/components/studio/hooks/use-generation-runs";
import type { BatchGenerationItem } from "@/components/studio/hooks/use-image-jobs";
import { RawImage } from "@/components/studio/raw-image";
import { useStudioState, type GenerationInputMode, type PromptTemplateMode } from "@/components/studio/state/studio-context";
import {
  getAspectRatioLabel,
  getModelLabel,
  getProviderLabel
} from "@/components/studio/utils/format";
import {
  getResolutionLabel,
  RESOLUTION_OPTIONS
} from "@/components/studio/utils/generation-options";

type CatalogModel = CatalogResponse["models"][number];
type ResolutionOption = (typeof RESOLUTION_OPTIONS)[number];

type ComposerPanelProps = {
  catalog: CatalogResponse | null;
  selectedModel: CatalogModel | undefined;
  selectedRecord: ImageRecord | undefined;
  providerModels: CatalogModel[];
  activeSourceRecords: ImageRecord[];
  visibleTemplates: PromptTemplateResponse[];
  resolutionOptions: ReadonlyArray<ResolutionOption>;
  aspectRatioOptions: string[];
  canUseImageMode: boolean;
  canContinueEdit: boolean;
  supportsCustomSize: boolean;
  isConfigured: boolean;
  batchItems: BatchGenerationItem[];
  batchRunning: boolean;
  batchFinishedCount: number;
  batchProgressPercent: number;
  batchElapsedLabel: string;
  batchPromptCounterLabel: string;
  batchParseErrorKey?: string;
  batchHasTooManyPrompts: boolean;
  batchHasTooLongPrompt: boolean;
  pendingGeneration: PendingGeneration | null;
  activeStudioRunIsRunning: boolean;
  runningBackgroundRunCount: number;
  elapsedSeconds: number;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToGallery: () => void;
  onClearOutputResult: () => void;
  onToggleStudioLayout: () => void;
  onUpdateGenerationInputMode: (mode: GenerationInputMode) => void;
  onUpdateMode: (mode: ImageMode) => void;
  onChooseModel: (model: string) => void;
  onChooseAspectRatio: (aspectRatio: string) => void;
  onChooseResolution: (resolution: string) => void;
  onChooseQuality: (quality: string) => void;
  onChooseInputFidelity: (inputFidelity: string) => void;
  onInsertBatchPromptTemplate: () => void;
  onSaveCurrentPromptAsTemplate: () => void;
  onApplyPromptTemplate: (template: PromptTemplateResponse) => void;
  onDeletePromptTemplate: (template: PromptTemplateResponse) => void;
  onClearSource: (id: string) => void;
  onRemoveFile: (index: number) => void;
  onReferenceDrag: (event: DragEvent<HTMLDivElement>) => void;
  onReferenceDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUpdateFiles: (files: FileList | null) => void;
  onKeepActiveRunInStudio: () => void;
  onSendActiveRunToBackground: () => void;
};

export function ComposerPanel({
  catalog,
  selectedModel,
  selectedRecord,
  providerModels,
  activeSourceRecords,
  visibleTemplates,
  resolutionOptions,
  aspectRatioOptions,
  canUseImageMode,
  canContinueEdit,
  supportsCustomSize,
  isConfigured,
  batchItems,
  batchRunning,
  batchFinishedCount,
  batchProgressPercent,
  batchElapsedLabel,
  batchPromptCounterLabel,
  batchParseErrorKey,
  batchHasTooManyPrompts,
  batchHasTooLongPrompt,
  pendingGeneration,
  activeStudioRunIsRunning,
  runningBackgroundRunCount,
  elapsedSeconds,
  promptRef,
  fileInputRef,
  t,
  onSubmit,
  onBackToGallery,
  onClearOutputResult,
  onToggleStudioLayout,
  onUpdateGenerationInputMode,
  onUpdateMode,
  onChooseModel,
  onChooseAspectRatio,
  onChooseResolution,
  onChooseQuality,
  onChooseInputFidelity,
  onInsertBatchPromptTemplate,
  onSaveCurrentPromptAsTemplate,
  onApplyPromptTemplate,
  onDeletePromptTemplate,
  onClearSource,
  onRemoveFile,
  onReferenceDrag,
  onReferenceDrop,
  onUpdateFiles,
  onKeepActiveRunInStudio,
  onSendActiveRunToBackground
}: ComposerPanelProps) {
  const { state, actions } = useStudioState();
  const {
    activeView,
    studioLayout,
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
    filePreviewUrls,
    paramsOpen,
    quickMenu,
    loading,
    referenceDragging,
    locale,
    error,
    templateTitle,
    templateCategory,
    templateMode,
    templateOpen,
    deletingTemplateId
  } = state;
  const {
    setPrompt,
    setBatchPromptText,
    setSettingsOpen,
    setParamsOpen,
    setQuickMenu,
    setReferenceDragging,
    setTemplateTitle,
    setTemplateCategory,
    setTemplateMode,
    setTemplateOpen
  } = actions;

  return (
    <form
      className={`control-panel ${loading ? "is-busy" : ""} ${paramsOpen ? "is-params-open" : ""}`}
      onSubmit={onSubmit}
      aria-busy={loading}
    >
      <div className="panel-heading">
        {activeView === "studio" && (
          <button className="text-button studio-back-button" type="button" disabled={loading} onClick={onBackToGallery}>
            <ChevronDown size={15} />
            {locale === "zh" ? "返回图库" : "Gallery"}
          </button>
        )}
        <div>
          <p className="section-label">{t("create")}</p>
          <h1>{t("promptStudio")}</h1>
        </div>
        <div className="control-heading-actions">
          <button className="icon-button" type="button" title={locale === "zh" ? "清空输出" : "Clear output"} disabled={loading || (!selectedRecord && batchItems.length === 0)} onClick={onClearOutputResult}>
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            title={studioLayout === "controls-left"
              ? (locale === "zh" ? "切换为输出在左" : "Move output left")
              : (locale === "zh" ? "切换为控制台在左" : "Move console left")}
            aria-pressed={studioLayout === "controls-right"}
            onClick={onToggleStudioLayout}
          >
            <ArrowLeftRight size={18} />
          </button>
          <button className="icon-button" type="button" title={t("settings")} onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      <div className="mode-toggle full-width input-mode-toggle" aria-label={locale === "zh" ? "输入方式" : "Input mode"}>
        <button
          className={generationInputMode === "single" ? "is-active" : ""}
          data-testid="input-mode-single"
          type="button"
          disabled={loading}
          onClick={() => onUpdateGenerationInputMode("single")}
        >
          {t("singleMode")}
        </button>
        <button
          className={generationInputMode === "batch" ? "is-active" : ""}
          data-testid="input-mode-batch"
          type="button"
          disabled={loading}
          onClick={() => onUpdateGenerationInputMode("batch")}
        >
          {t("batchMode")}
        </button>
      </div>

      <div className="mode-toggle full-width" aria-label={locale === "zh" ? "生成模式" : "Generation mode"}>
        <button
          className={mode === "text-to-image" ? "is-active" : ""}
          type="button"
          disabled={loading}
          onClick={() => onUpdateMode("text-to-image")}
        >
          {t("textToImage")}
        </button>
        <button
          className={mode === "image-to-image" ? "is-active" : ""}
          type="button"
          disabled={loading || !canUseImageMode}
          onClick={() => onUpdateMode("image-to-image")}
        >
          {t("imageToImage")}
        </button>
      </div>

      <div className="quick-bar">
        <div className="quick-control">
          <button
            className={`quick-chip ${quickMenu === "model" ? "is-open" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => setQuickMenu((current) => current === "model" ? null : "model")}
          >
            <span>{t("model")}</span>
            <strong>{selectedModel?.label ?? model}</strong>
            <ChevronDown size={15} />
          </button>
          {quickMenu === "model" && (
            <div className="quick-menu quick-menu-model">
              {providerModels.map((item) => (
                <button
                  className={item.modelId === model ? "is-selected" : ""}
                  key={item.modelId}
                  type="button"
                  onClick={() => onChooseModel(item.modelId)}
                >
                  <span>{item.label}</span>
                  {item.modelId === model && <Check size={15} />}
                </button>
              ))}
              <div className="quick-capabilities">
                <span>{modelSupports(selectedModel, "text-to-image") ? t("textReady") : t("textOff")}</span>
                <span>{canUseImageMode ? t("imageReady") : t("imageOff")}</span>
                <span>{canContinueEdit ? t("continueReady") : t("continueOff")}</span>
              </div>
            </div>
          )}
        </div>

        <div className="quick-control spec-control">
          <button
            className={`spec-select ${quickMenu === "aspect" ? "is-open" : ""}`}
            type="button"
            aria-label={t("aspectRatio")}
            title={t("aspectRatio")}
            disabled={loading}
            onClick={() => setQuickMenu((current) => current === "aspect" ? null : "aspect")}
          >
            <span>{t("aspectRatio")}</span>
            <strong>{getAspectRatioLabel(aspectRatio)}</strong>
            <ChevronDown size={16} />
          </button>
          {quickMenu === "aspect" && (
            <div className="quick-menu spec-menu quick-menu-aspect">
              {aspectRatioOptions.map((item) => (
                <button
                  className={item === aspectRatio ? "is-selected" : ""}
                  key={item}
                  type="button"
                  onClick={() => onChooseAspectRatio(item)}
                >
                  <span>{getAspectRatioLabel(item)}</span>
                  {item === aspectRatio && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="quick-control spec-control">
          <button
            className={`spec-select ${quickMenu === "resolution" ? "is-open" : ""}`}
            type="button"
            aria-label={t("resolution")}
            title={t("resolution")}
            disabled={loading}
            onClick={() => setQuickMenu((current) => current === "resolution" ? null : "resolution")}
          >
            <span>{t("resolution")}</span>
            <strong>{getResolutionLabel(resolution, locale)}</strong>
            <ChevronDown size={16} />
          </button>
          {quickMenu === "resolution" && (
            <div className="quick-menu spec-menu quick-menu-resolution">
              {resolutionOptions.map((item) => (
                <button
                  className={item.value === resolution ? "is-selected" : ""}
                  key={item.value}
                  type="button"
                  onClick={() => onChooseResolution(item.value)}
                >
                  <span>{item.labels[locale]}</span>
                  {item.value === resolution && <Check size={15} />}
                </button>
              ))}
              {!supportsCustomSize && (
                <div className="quick-capabilities">
                  <span>{locale === "zh" ? "2K/4K 需要 OpenAI-compatible Base URL" : "2K/4K needs an OpenAI-compatible Base URL"}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedModel?.qualityOptions && selectedModel.qualityOptions.length > 1 && (
          <div className="quick-control">
            <button
              className={`quick-chip ${quickMenu === "quality" ? "is-open" : ""}`}
              type="button"
              disabled={loading}
              onClick={() => setQuickMenu((current) => current === "quality" ? null : "quality")}
            >
              <span>{t("quality")}</span>
              <strong>{quality}</strong>
              <ChevronDown size={15} />
            </button>
            {quickMenu === "quality" && (
              <div className="quick-menu quick-menu-quality">
                {selectedModel.qualityOptions.map((item) => (
                  <button
                    className={item === quality ? "is-selected" : ""}
                    key={item}
                    type="button"
                    onClick={() => onChooseQuality(item)}
                  >
                    <span>{item}</span>
                    {item === quality && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "image-to-image" && selectedModel?.inputFidelityOptions && (
          <div className="quick-control">
            <button
              className={`quick-chip ${quickMenu === "fidelity" ? "is-open" : ""}`}
              type="button"
              disabled={loading}
              onClick={() => setQuickMenu((current) => current === "fidelity" ? null : "fidelity")}
            >
              <span>{t("fidelity")}</span>
              <strong>{inputFidelity}</strong>
              <ChevronDown size={15} />
            </button>
            {quickMenu === "fidelity" && (
              <div className="quick-menu quick-menu-fidelity">
                {selectedModel.inputFidelityOptions.map((item) => (
                  <button
                    className={item === inputFidelity ? "is-selected" : ""}
                    key={item}
                    type="button"
                    onClick={() => onChooseInputFidelity(item)}
                  >
                    <span>{item}</span>
                    {item === inputFidelity && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <label className="prompt-field">
        <span>{generationInputMode === "batch" ? `${t("prompt")} / ${t("batchMode")}` : t("prompt")}</span>
        <textarea
          className={`textarea ${generationInputMode === "batch" ? "batch-textarea" : ""}`}
          data-testid="prompt-input"
          ref={promptRef}
          value={generationInputMode === "batch" ? batchPromptText : prompt}
          onChange={(event) => {
            if (generationInputMode === "batch") {
              setBatchPromptText(event.target.value);
            } else {
              setPrompt(event.target.value);
            }
          }}
          placeholder={generationInputMode === "batch"
            ? (mode === "text-to-image" ? t("batchPromptPlaceholderText") : t("batchPromptPlaceholderImage"))
            : (mode === "text-to-image" ? t("promptPlaceholderText") : t("promptPlaceholderImage"))}
          disabled={loading}
        />
      </label>
      <div className="prompt-tools">
        <div className="prompt-tool-actions">
          <button
            className="text-button tiny"
            type="button"
            disabled={loading || (generationInputMode === "batch" ? !batchPromptText : !prompt)}
            onClick={() => {
              if (generationInputMode === "batch") {
                setBatchPromptText("");
              } else {
                setPrompt("");
              }
            }}
          >
            {t("clear")}
          </button>
          {generationInputMode === "batch" && (
            <button className="text-button tiny" type="button" disabled={loading} onClick={onInsertBatchPromptTemplate}>
              <Sparkles size={14} />
              {t("batchTemplate")}
            </button>
          )}
          <button className="text-button tiny" type="button" disabled={loading} onClick={() => setTemplateOpen((current) => !current)}>
            <Archive size={14} />
            {locale === "zh" ? "模板库" : "Templates"}
          </button>
          <button className="text-button tiny" type="button" disabled={loading} onClick={onSaveCurrentPromptAsTemplate}>
            <Save size={14} />
            {locale === "zh" ? "保存模板" : "Save"}
          </button>
        </div>
        <span className={batchParseErrorKey || batchHasTooManyPrompts || batchHasTooLongPrompt ? "is-warning" : ""}>{batchPromptCounterLabel}</span>
      </div>

      {templateOpen && (
        <div className="template-panel">
          <div className="template-save-row">
            <input
              className="field"
              value={templateTitle}
              onChange={(event) => setTemplateTitle(event.target.value)}
              placeholder={locale === "zh" ? "模板标题" : "Template title"}
            />
            <input
              className="field"
              value={templateCategory}
              onChange={(event) => setTemplateCategory(event.target.value)}
              placeholder={locale === "zh" ? "分类" : "Category"}
            />
            <select className="field" value={templateMode} onChange={(event) => setTemplateMode(event.target.value as PromptTemplateMode)}>
              <option value="universal">{locale === "zh" ? "通用" : "Universal"}</option>
              <option value="text-to-image">{t("textToImage")}</option>
              <option value="image-to-image">{t("imageToImage")}</option>
            </select>
          </div>
          <div className="template-list">
            {visibleTemplates.length > 0 ? visibleTemplates.map((template) => (
              <div className="template-row" key={template.id}>
                <button className="template-row-main" type="button" onClick={() => onApplyPromptTemplate(template)}>
                  <strong>{template.title}</strong>
                  <span>{template.category} / {template.mode}</span>
                </button>
                <button
                  className="icon-button template-delete-button"
                  type="button"
                  title={locale === "zh" ? "删除模板" : "Delete template"}
                  aria-label={locale === "zh" ? "删除模板" : "Delete template"}
                  disabled={Boolean(deletingTemplateId)}
                  onClick={() => onDeletePromptTemplate(template)}
                >
                  {deletingTemplateId === template.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
            )) : (
              <p>{locale === "zh" ? "还没有模板。输入提示词后点击保存模板。" : "No templates yet. Enter a prompt and save it."}</p>
            )}
          </div>
        </div>
      )}

      <button
        className={`text-button composer-drawer-toggle ${paramsOpen ? "is-open" : ""}`}
        data-testid="composer-drawer-toggle"
        type="button"
        aria-expanded={paramsOpen}
        onClick={() => setParamsOpen((current) => !current)}
      >
        <Settings2 size={16} />
        <span>{locale === "zh" ? "参数" : "Params"}</span>
        <strong>{getAspectRatioLabel(aspectRatio)} / {getResolutionLabel(resolution, locale)}</strong>
        <ChevronDown size={15} />
      </button>

      {(activeSourceRecords.length > 0 || files.length > 0) && (
        <div className="reference-strip" aria-label={locale === "zh" ? "参考图" : "Reference images"}>
          {activeSourceRecords.map((record) => (
            <div className="reference-chip" key={record.id}>
              <RawImage src={record.thumbnailUrl ?? record.imageUrl} alt={t("imagePreview")} loading="lazy" />
              <span>{getModelLabel(catalog, record.provider, record.model)}</span>
              <button className="icon-button" type="button" title={locale === "zh" ? "移除来源" : "Remove source"} onClick={() => onClearSource(record.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
          {files.map((file, index) => (
            <div className="reference-chip" key={`${file.name}:${file.lastModified}`}>
              {filePreviewUrls[index] ? <RawImage src={filePreviewUrls[index]} alt={file.name} /> : <ImagePlus size={18} />}
              <span>{file.name}</span>
              <button className="icon-button" type="button" title={locale === "zh" ? "移除文件" : "Remove file"} onClick={() => onRemoveFile(index)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-actions">
        <div
          className={`drop-zone ${referenceDragging ? "is-dragging" : ""} ${loading || !canUseImageMode ? "is-disabled" : ""}`}
          onDragEnter={onReferenceDrag}
          onDragOver={onReferenceDrag}
          onDragLeave={() => setReferenceDragging(false)}
          onDrop={onReferenceDrop}
        >
          <label className="upload-chip">
            <Upload size={17} />
            <span>{files.length > 0 ? `${files.length} ${locale === "zh" ? "张参考图" : `reference${files.length > 1 ? "s" : ""}`}` : t("addReference")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => onUpdateFiles(event.target.files)}
              disabled={loading || !canUseImageMode}
            />
          </label>
          <p>{t("dragImages")}</p>
        </div>

        <p className="hint">
          {loading ? t("requestSent") : activeStudioRunIsRunning ? t("backgroundRunning") : isConfigured ? t("ready") : t("missingKey")}
          {" / "}
          {activeStudioRunIsRunning
            ? (batchRunning ? `${batchFinishedCount}/${batchItems.length}` : t("generatingSmall"))
            : t("referencesEnabled")}
        </p>
      </div>

      {(loading || activeStudioRunIsRunning) && (pendingGeneration || batchRunning) && (
        <div className="composer-status" role="status">
          <Loader2 className="spin" size={17} />
          <span>
            {batchRunning
              ? `${t("generatingBatch")} ${batchFinishedCount}/${batchItems.length}`
              : `${t("generatingWith")} ${pendingGeneration ? getProviderLabel(catalog, pendingGeneration.provider) : ""}`}
          </span>
          <strong>{batchRunning ? `${batchProgressPercent}% / ${batchElapsedLabel}` : `${elapsedSeconds}s`}</strong>
        </div>
      )}

      {activeStudioRunIsRunning && (
        <div className="background-run-panel" data-testid="background-run-panel" role="status">
          <div>
            <Loader2 className="spin" size={16} />
            <span>{t("backgroundRunning")}</span>
            {runningBackgroundRunCount > 0 && <strong>{runningBackgroundRunCount}</strong>}
          </div>
          <div className="background-run-actions">
            <button className="text-button tiny" type="button" onClick={onKeepActiveRunInStudio}>
              <Check size={14} />
              {t("stayInStudio")}
            </button>
            <button className="text-button tiny" data-testid="send-background-run" type="button" onClick={onSendActiveRunToBackground}>
              <ArrowLeftRight size={14} />
              {t("runInBackground")}
            </button>
          </div>
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <button className="primary-button generate-button" data-testid="generate-submit" type="submit" disabled={loading || !isConfigured}>
        {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        {loading
          ? t("requestSent")
          : (generationInputMode === "batch" ? t("generateBatch") : t("generateImage"))}
      </button>
    </form>
  );
}
