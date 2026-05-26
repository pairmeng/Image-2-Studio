import { Check, Eye, Layers3, Loader2, Pause, Play, RefreshCw, Trash2, X } from "lucide-react";
import type { CatalogResponse, ImageJobResponse } from "@/lib/types";
import {
  isActiveImageJobStatus,
  isForceKillableImageJobStatus,
  isPausableImageJobStatus,
  isResumableImageJobStatus,
  isRetryableImageJobStatus
} from "@/lib/image-job-state";

type JobAction = "pause" | "resume" | "kill";

type JobMonitorLabels = {
  title: string;
  activity: string;
  summary: string;
  refreshJobs: string;
  batchPending: string;
  batchPaused: string;
  batchRunning: string;
  batchSucceeded: string;
  batchFailed: string;
  batchPause: string;
  batchResume: string;
  jobKill: string;
  batchRetry: string;
  loadingMore: string;
  openBatch: string;
  trackProgress: string;
  viewResult: string;
  viewFailureReason: string;
  jobBusy: string;
  noRecentJobs: string;
  clearFinished: string;
  clearAlerts: string;
  refreshGallery: string;
};

type JobMonitorProps = {
  open: boolean;
  catalog: CatalogResponse | null;
  jobs: ImageJobResponse[];
  activeCount: number;
  alertCount: number;
  finishedCount: number;
  jobsLoading: boolean;
  historyLoading: boolean;
  clearingAlerts: boolean;
  clearingFinished: boolean;
  trackingJobId: string;
  jobActionId: string;
  labels: JobMonitorLabels;
  onToggle: () => void;
  onRefreshJobs: () => void;
  onTrackJob: (job: ImageJobResponse) => void;
  onChangeJobState: (jobId: string, action: JobAction) => void;
  onRetryStandaloneJob: (job: ImageJobResponse) => void;
  onClearFinished: () => void;
  onClearAlerts: () => void;
  onRefreshGallery: () => void;
};

function formatJobDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getJobModelLabel(catalog: CatalogResponse | null, provider: ImageJobResponse["provider"], modelId: string) {
  return catalog?.models.find((item) => item.provider === provider && item.modelId === modelId)?.label ?? modelId;
}

export function JobMonitor({
  open,
  catalog,
  jobs,
  activeCount,
  alertCount,
  finishedCount,
  jobsLoading,
  historyLoading,
  clearingAlerts,
  clearingFinished,
  trackingJobId,
  jobActionId,
  labels,
  onToggle,
  onRefreshJobs,
  onTrackJob,
  onChangeJobState,
  onRetryStandaloneJob,
  onClearFinished,
  onClearAlerts,
  onRefreshGallery
}: JobMonitorProps) {
  return (
    <div className={`topbar-activity ${open ? "is-open" : ""}`}>
      <button
        className={`icon-button topbar-activity-button ${open ? "is-active" : ""}`}
        data-testid="job-monitor-toggle"
        type="button"
        title={labels.title}
        aria-expanded={open}
        aria-controls="topbar-activity-popover"
        onClick={onToggle}
      >
        <Layers3 size={17} />
        {alertCount > 0 && (
          <span className={`activity-badge ${activeCount > 0 ? "is-active" : "is-failed"}`}>
            {alertCount}
          </span>
        )}
      </button>
      {open && (
        <div className="topbar-activity-popover" data-testid="job-monitor-popover" id="topbar-activity-popover">
          <div className="activity-popover-head">
            <div>
              <p className="section-label">{labels.activity}</p>
              <h2>{labels.title}</h2>
              <p className="job-monitor-compact-summary">
                {labels.summary}
              </p>
            </div>
            <button className="text-button tiny job-monitor-refresh" type="button" disabled={jobsLoading} onClick={onRefreshJobs}>
              {jobsLoading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
              {labels.refreshJobs}
            </button>
          </div>
          {jobs.length > 0 ? (
            <div className="job-monitor-list" data-testid="job-monitor-list">
              {jobs.slice(0, 8).map((job) => {
                const isActiveJob = isActiveImageJobStatus(job.status);
                const statusLabel = job.status === "pending"
                  ? labels.batchPending
                  : job.status === "paused"
                    ? labels.batchPaused
                    : job.status === "running"
                      ? labels.batchRunning
                      : job.status === "succeeded"
                        ? labels.batchSucceeded
                        : labels.batchFailed;
                const actionDisabled = Boolean(trackingJobId || jobActionId);
                const actionTitle = actionDisabled ? labels.jobBusy : undefined;
                const actionLabel = job.batchId
                  ? labels.openBatch
                  : isActiveJob
                    ? labels.trackProgress
                    : job.status === "failed"
                      ? labels.viewFailureReason
                      : labels.viewResult;

                return (
                  <div className={`job-monitor-row is-${job.status}`} data-job-status={job.status} data-testid="job-monitor-row" key={job.id}>
                    <div className="job-monitor-icon">
                      {trackingJobId === job.id || isActiveJob ? <Loader2 className="spin" size={16} /> : job.status === "paused" ? <Pause size={16} /> : job.status === "succeeded" ? <Check size={16} /> : <X size={16} />}
                    </div>
                    <div className="job-monitor-copy">
                      <div className="job-monitor-line">
                        <strong>{statusLabel}</strong>
                        <span>{getJobModelLabel(catalog, job.provider, job.model)}</span>
                        <span>{formatJobDate(job.createdAt)}</span>
                      </div>
                      <p>{job.prompt || job.id}</p>
                      {job.error && <small>{job.error}</small>}
                    </div>
                    <div className="job-monitor-buttons">
                      {job.batchId ? (
                        <button className="text-button tiny" data-testid="job-monitor-track" type="button" title={actionTitle} aria-label={actionLabel} disabled={actionDisabled} onClick={() => onTrackJob(job)}>
                          <Layers3 size={14} />
                          {labels.openBatch}
                        </button>
                      ) : (
                        <button className="text-button tiny" data-testid="job-monitor-track" type="button" title={actionTitle} aria-label={actionLabel} disabled={actionDisabled} onClick={() => onTrackJob(job)}>
                          {isActiveJob ? <RefreshCw size={14} /> : <Eye size={14} />}
                          {actionLabel}
                        </button>
                      )}
                      {isPausableImageJobStatus(job.status) && (
                        <button className="text-button tiny" data-testid="job-monitor-pause" type="button" disabled={Boolean(trackingJobId || jobActionId)} onClick={() => onChangeJobState(job.id, "pause")}>
                          {jobActionId === job.id ? <Loader2 className="spin" size={14} /> : <Pause size={14} />}
                          {labels.batchPause}
                        </button>
                      )}
                      {isResumableImageJobStatus(job.status) && (
                        <button className="text-button tiny" data-testid="job-monitor-resume" type="button" disabled={Boolean(trackingJobId || jobActionId)} onClick={() => onChangeJobState(job.id, "resume")}>
                          {jobActionId === job.id ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                          {labels.batchResume}
                        </button>
                      )}
                      {isForceKillableImageJobStatus(job.status) && (
                        <button className="text-button tiny danger-button" data-testid="job-monitor-kill" type="button" disabled={Boolean(trackingJobId || jobActionId)} onClick={() => onChangeJobState(job.id, "kill")}>
                          {jobActionId === job.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                          {labels.jobKill}
                        </button>
                      )}
                      {isRetryableImageJobStatus(job.status) && !job.batchId && (
                        <button className="text-button tiny" data-testid="job-monitor-retry" type="button" disabled={Boolean(trackingJobId || jobActionId)} onClick={() => onRetryStandaloneJob(job)}>
                          <RefreshCw size={14} />
                          {labels.batchRetry}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="job-monitor-empty">{jobsLoading ? labels.loadingMore : labels.noRecentJobs}</p>
          )}
          <div className="activity-popover-actions">
            <button className="text-button tiny danger-button" data-testid="job-monitor-clear-finished" type="button" disabled={clearingFinished || finishedCount === 0} onClick={onClearFinished}>
              {clearingFinished ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
              {labels.clearFinished}
            </button>
            <button className="text-button tiny" data-testid="job-monitor-clear-alerts" type="button" disabled={clearingAlerts} onClick={onClearAlerts}>
              {clearingAlerts ? <Loader2 className="spin" size={14} /> : <Check size={14} />}
              {labels.clearAlerts}
            </button>
            <button className="text-button tiny" data-testid="job-monitor-refresh-gallery" type="button" disabled={historyLoading} onClick={onRefreshGallery}>
              {historyLoading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
              {labels.refreshGallery}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
