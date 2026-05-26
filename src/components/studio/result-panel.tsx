import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import type { CatalogResponse, ImageRecord } from "@/lib/types";
import { RawImage } from "@/components/studio/raw-image";
import type { PendingGeneration } from "@/components/studio/hooks/use-generation-runs";
import type { BatchGenerationItem } from "@/components/studio/hooks/use-image-jobs";
import { useStudioState } from "@/components/studio/state/studio-context";
import {
  formatDate,
  getGenerationDetailLabel,
  getModelLabel,
  getProviderLabel
} from "@/components/studio/utils/format";
import {
  isForceKillableImageJobStatus,
  isPausableImageJobStatus,
  isResumableImageJobStatus,
  isRetryableBatchItemStatus
} from "@/lib/image-job-state";

type CatalogModel = CatalogResponse["models"][number];

type ResultPanelProps = {
  catalog: CatalogResponse | null;
  selectedModel: CatalogModel | undefined;
  selectedRecord: ImageRecord | undefined;
  selectedRecordCanContinue: boolean;
  isConfigured: boolean;
  batchItems: BatchGenerationItem[];
  batchRunning: boolean;
  batchFinishedCount: number;
  batchSucceededCount: number;
  batchFailedCount: number;
  batchPausedOnly: boolean;
  batchElapsedLabel: string;
  batchProgressPercent: number;
  activeBatchId: string;
  pendingGeneration: PendingGeneration | null;
  elapsedSeconds: number;
  jobActionId: string;
  trackingJobId: string;
  t: (key: string) => string;
  onLoadBatchDetail: (batchId: string) => void;
  onRetryFailedBatchItems: () => void;
  onChangeImageJobState: (jobId: string, action: "pause" | "resume" | "kill") => void;
  onRetryBatchItem: (item: BatchGenerationItem) => void;
  onOpenLightbox: (recordId: string) => void;
  onStartContinueEdit: (record: ImageRecord) => void;
  onCopyImage: (record: ImageRecord) => void;
  onCopyPromptText: (record: ImageRecord) => void;
};

export function ResultPanel({
  catalog,
  selectedModel,
  selectedRecord,
  selectedRecordCanContinue,
  isConfigured,
  batchItems,
  batchRunning,
  batchFinishedCount,
  batchSucceededCount,
  batchFailedCount,
  batchPausedOnly,
  batchElapsedLabel,
  batchProgressPercent,
  activeBatchId,
  pendingGeneration,
  elapsedSeconds,
  jobActionId,
  trackingJobId,
  t,
  onLoadBatchDetail,
  onRetryFailedBatchItems,
  onChangeImageJobState,
  onRetryBatchItem,
  onOpenLightbox,
  onStartContinueEdit,
  onCopyImage,
  onCopyPromptText
}: ResultPanelProps) {
  const { state } = useStudioState();
  const {
    generationInputMode,
    loading,
    locale,
    copiedId,
    copiedPromptId
  } = state;

  return (
    <section className="result-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">{t("result")}</p>
          <h2>{t("imageOutput")}</h2>
        </div>
        <span className={`status-pill ${isConfigured ? "is-ready" : ""}`}>
          {isConfigured ? t("providerReady") : t("missingKey")}
        </span>
      </div>

      {generationInputMode === "batch" && batchItems.length === 0 && !batchRunning ? (
        <div className="result-empty">
          <Sparkles size={36} />
          <h2>{t("batchOutput")}</h2>
          <p>{t("batchEmpty")}</p>
        </div>
      ) : batchItems.length > 0 && (generationInputMode === "batch" || batchRunning) ? (
        <div
          className={`result-stage batch-result-stage ${batchRunning ? "is-pending" : ""}`}
          data-testid="batch-result-stage"
          aria-live="polite"
          aria-busy={batchRunning}
        >
          <div className="batch-result-summary">
            <div>
              <p className="section-label">{t("batchProgress")}</p>
              <h2>{t("batchOutput")}</h2>
            </div>
            <div className="batch-result-actions">
              {activeBatchId && (
                <button className="text-button tiny" type="button" disabled={loading} onClick={() => onLoadBatchDetail(activeBatchId)}>
                  <RefreshCw size={14} />
                  {locale === "zh" ? "刷新批次" : "Refresh batch"}
                </button>
              )}
              {batchFailedCount > 0 && (
                <button className="text-button tiny" type="button" disabled={loading} onClick={onRetryFailedBatchItems}>
                  <RefreshCw size={14} />
                  {t("batchRetryAllFailed")}
                </button>
              )}
              <span className={`status-pill ${batchRunning ? "is-ready" : ""}`}>
                {batchRunning ? `${batchFinishedCount}/${batchItems.length}` : batchPausedOnly ? t("batchPaused") : t("batchComplete")}
              </span>
            </div>
          </div>
          <div className="batch-progress-grid">
            <div>
              <strong>{batchSucceededCount}</strong>
              <span>{t("batchSucceeded")}</span>
            </div>
            <div>
              <strong>{batchFailedCount}</strong>
              <span>{t("batchFailed")}</span>
            </div>
            <div>
              <strong>{batchItems.length}</strong>
              <span>{t("batchPrompts")}</span>
            </div>
            <div>
              <strong>{batchElapsedLabel}</strong>
              <span>{t("batchElapsed")}</span>
            </div>
          </div>
          <div className="batch-progress-bar" aria-hidden="true">
            <span style={{ width: `${batchProgressPercent}%` }} />
          </div>
          <div className="batch-result-list">
            {batchItems.map((item) => {
              const statusLabel = item.status === "queued"
                ? t("batchQueued")
                : item.status === "creating"
                  ? t("batchCreating")
                  : item.status === "pending"
                    ? t("batchPending")
                    : item.status === "paused"
                      ? t("batchPaused")
                      : item.status === "running"
                        ? t("batchRunning")
                        : item.status === "succeeded"
                          ? t("batchSucceeded")
                          : t("batchFailed");

              return (
                <div className={`batch-result-item is-${item.status}`} data-testid="batch-result-item" key={item.id}>
                  <div className="batch-result-thumb">
                    {item.imageUrl ? (
                      <RawImage src={item.thumbnailUrl ?? item.imageUrl} alt={t("imagePreview")} loading="lazy" />
                    ) : item.status === "failed" ? (
                      <X size={18} />
                    ) : item.status === "succeeded" ? (
                      <Check size={18} />
                    ) : item.status === "paused" ? (
                      <Pause size={18} />
                    ) : (
                      <Loader2 className={item.status === "queued" ? "" : "spin"} size={18} />
                    )}
                  </div>
                  <div className="batch-result-copy">
                    <div className="batch-result-line">
                      <strong>#{item.index + 1}</strong>
                      <span className="tag">{statusLabel}</span>
                      <span className="tag">{getModelLabel(catalog, item.provider, item.model)}</span>
                    </div>
                    <p>{item.prompt}</p>
                    {item.error && <small>{item.error}</small>}
                  </div>
                  <div className="batch-item-actions" data-testid="batch-item-actions">
                    {isPausableImageJobStatus(item.status) && item.jobId && (
                      <button className="text-button tiny" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => onChangeImageJobState(item.jobId!, "pause")}>
                        {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Pause size={14} />}
                        {t("batchPause")}
                      </button>
                    )}
                    {isResumableImageJobStatus(item.status) && item.jobId && (
                      <button className="text-button tiny" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => onChangeImageJobState(item.jobId!, "resume")}>
                        {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                        {t("batchResume")}
                      </button>
                    )}
                    {isForceKillableImageJobStatus(item.status) && item.jobId && (
                      <button className="text-button tiny danger-button" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => onChangeImageJobState(item.jobId!, "kill")}>
                        {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                        {t("jobKill")}
                      </button>
                    )}
                    {isRetryableBatchItemStatus(item.status) && (
                      <button className="text-button tiny" type="button" disabled={loading} onClick={() => onRetryBatchItem(item)}>
                        <RefreshCw size={14} />
                        {t("batchRetry")}
                      </button>
                    )}
                    {item.imageUrl && (
                      <a className="icon-button" title={t("open")} href={item.imageUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : pendingGeneration ? (
        <div className="result-stage is-pending" aria-live="polite" aria-busy="true">
          <div className="result-meta">
            <span className="tag is-provider">{getProviderLabel(catalog, pendingGeneration.provider)}</span>
            <span className="tag">{getModelLabel(catalog, pendingGeneration.provider, pendingGeneration.model)}</span>
            <span className="tag is-live">{t("generating")} {elapsedSeconds}s</span>
          </div>
          <div className="generation-preview large">
            <div className="generation-grid" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="generation-center">
              <Loader2 className="spin" size={26} />
              <strong>{t("generatingImage")}</strong>
              <span>{t("keepOpen")}</span>
            </div>
          </div>
          <div className="generation-progress">
            <span />
          </div>
          <details className="result-details">
            <summary>
              <span>{t("generationDetails")}</span>
              <strong>{getGenerationDetailLabel(pendingGeneration)}</strong>
              <ChevronDown size={16} />
            </summary>
            <p className="result-prompt">{pendingGeneration.prompt}</p>
          </details>
        </div>
      ) : selectedRecord ? (
        <div className="result-stage">
          <div className="result-meta">
            <span className="tag is-provider">{getProviderLabel(catalog, selectedRecord.provider)}</span>
            <span className="tag">{getModelLabel(catalog, selectedRecord.provider, selectedRecord.model)}</span>
            <span className="tag">{selectedRecord.mode === "text-to-image" ? t("text") : t("imageInput")}</span>
            <span className="tag">{formatDate(selectedRecord.createdAt)}</span>
          </div>
          <button className="hero-image-button" type="button" onClick={() => onOpenLightbox(selectedRecord.id)} title={t("preview")}>
            <RawImage className="hero-result-image" src={selectedRecord.imageUrl} alt={t("imagePreview")} fetchPriority="high" />
            <span>
              <ExternalLink size={15} />
              {t("preview")}
            </span>
          </button>
          <div className="result-actions">
            <button
              className="text-button"
              title={t("editThisImage")}
              type="button"
              disabled={!selectedRecordCanContinue}
              onClick={() => onStartContinueEdit(selectedRecord)}
            >
              <ImagePlus size={17} />
              {t("editThisImage")}
            </button>
            <button className="text-button" title={t("copyLink")} type="button" onClick={() => onCopyImage(selectedRecord)}>
              {copiedId === selectedRecord.id ? <Check size={17} /> : <Copy size={17} />}
              {copiedId === selectedRecord.id ? t("copied") : t("copyLink")}
            </button>
            <a className="text-button" title={t("download")} href={selectedRecord.imageUrl} download>
              <Download size={17} />
              {t("download")}
            </a>
            <a className="text-button" title={t("open")} href={selectedRecord.imageUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={17} />
              {t("open")}
            </a>
          </div>
          <details className="result-details">
            <summary>
              <span>{t("generationDetails")}</span>
              <strong>{getGenerationDetailLabel(selectedRecord)}</strong>
              <ChevronDown size={16} />
            </summary>
            <div className="result-detail-body">
              <div className="result-detail-head">
                <span>{t("promptUsed")}</span>
                <button className="text-button tiny" type="button" onClick={() => onCopyPromptText(selectedRecord)}>
                  {copiedPromptId === selectedRecord.id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedPromptId === selectedRecord.id ? t("copied") : t("copyPrompt")}
                </button>
              </div>
              <p className="result-prompt">{selectedRecord.prompt}</p>
            </div>
          </details>
        </div>
      ) : (
        <div className="result-empty">
          <Sparkles size={36} />
          <h2>{t("noImageYet")}</h2>
          <p>{selectedModel?.description ?? t("emptyResult")}</p>
        </div>
      )}
    </section>
  );
}
