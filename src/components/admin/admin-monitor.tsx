"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Route,
  TimerReset,
  X
} from "lucide-react";
import type { PublicUser } from "@/lib/types";
import type { AdminJobFilters, AdminJobRecord, AdminMonitorResponse } from "./utils/admin-api";
import { AdminSection, EmptyState, MetricCard, StatusBadge } from "./admin-layout";
import {
  formatAdminConfigSource,
  formatAdminDate,
  formatAdminMilliseconds,
  formatAdminNumber,
  formatAdminPercent,
  formatAdminQueueBackend,
  formatAdminQueueMode,
  getStatusTone
} from "./utils/admin-format";

type AdminJobAction = "pause" | "resume" | "kill" | "retry";

function canRunJobAction(action: AdminJobAction, status: string) {
  if (action === "pause") return status === "pending";
  if (action === "resume") return status === "paused";
  if (action === "kill") return status === "pending" || status === "running" || status === "paused";
  return status === "pending" || status === "paused" || status === "failed";
}

function formatFailureCategory(value: string | undefined) {
  if (value === "provider_rate_limit") return "供应商限流";
  if (value === "provider_error") return "供应商错误";
  if (value === "timeout") return "请求超时";
  if (value === "file_save_failed") return "文件保存失败";
  if (value === "config_missing") return "配置缺失";
  if (value === "invalid_request") return "请求参数错误";
  if (value === "admin_action") return "管理员操作";
  return value || "-";
}

function AdminJobActionButtons({
  status,
  busy,
  onAction
}: {
  status: string;
  busy: boolean;
  onAction: (action: AdminJobAction) => void;
}) {
  return (
    <div className="admin-row-actions admin-job-row-actions">
      <button className="admin-icon-button" type="button" title="重试" disabled={busy || !canRunJobAction("retry", status)} onClick={() => onAction("retry")}>
        <RotateCcw size={15} />
      </button>
      <button className="admin-icon-button" type="button" title="暂停" disabled={busy || !canRunJobAction("pause", status)} onClick={() => onAction("pause")}>
        <PauseCircle size={15} />
      </button>
      <button className="admin-icon-button" type="button" title="恢复" disabled={busy || !canRunJobAction("resume", status)} onClick={() => onAction("resume")}>
        <PlayCircle size={15} />
      </button>
      <button className="admin-icon-button is-danger" type="button" title="终止" disabled={busy || !canRunJobAction("kill", status)} onClick={() => onAction("kill")}>
        <Ban size={15} />
      </button>
    </div>
  );
}

export function AdminMonitor({
  monitor,
  jobs,
  jobFilters,
  jobNextCursor,
  users,
  busy,
  onRefresh,
  onJobFiltersChange,
  onResetJobFilters,
  onLoadMoreJobs,
  onJobAction
}: {
  monitor: AdminMonitorResponse | null;
  jobs: AdminJobRecord[];
  jobFilters: AdminJobFilters;
  jobNextCursor?: string;
  users: PublicUser[];
  busy: string;
  onRefresh: () => void;
  onJobFiltersChange: (next: Partial<AdminJobFilters>) => void;
  onResetJobFilters: () => void;
  onLoadMoreJobs: () => void;
  onJobAction: (action: AdminJobAction, jobIds: string[]) => Promise<void> | void;
}) {
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const selectedJobs = useMemo(() => jobs.filter((job) => selectedJobIds.includes(job.id)), [jobs, selectedJobIds]);
  const selectedStatus = selectedJobs.length > 0 ? selectedJobs[0]?.status : "";
  const selectedSameStatus = selectedJobs.length > 0 && selectedJobs.every((job) => job.status === selectedStatus);
  const selectedJobIdSet = useMemo(() => new Set(selectedJobIds), [selectedJobIds]);
  const filtersActive = Object.values(jobFilters).some((value) => value.trim());
  const actionBusy = Boolean(busy);

  if (!monitor) {
    return <EmptyState>正在加载平台监控。</EmptyState>;
  }

  const queue = monitor.jobQueue;
  const backendLabel = formatAdminQueueBackend(queue.backend, queue.queue.enabled);
  const queueState = queue.queue.ok ? (queue.recentFailed > 0 ? "degraded" : "healthy") : "failing";
  const activeTotal = queue.pending + queue.running;
  const recentTotal = queue.recentSucceeded + queue.recentFailed;
  const failureRate = recentTotal > 0 ? (queue.recentFailed / recentTotal) * 100 : 0;
  const longestAverage = Math.max(
    queue.recent.averageQueueWaitMs ?? 0,
    queue.recent.averageExecutionMs ?? 0,
    queue.recent.averageUpstreamMs ?? 0,
    queue.recent.averageFileSaveMs ?? 0,
    1
  );
  const timingRows = [
    { label: "排队等待", value: queue.recent.averageQueueWaitMs },
    { label: "任务执行", value: queue.recent.averageExecutionMs },
    { label: "供应商响应", value: queue.recent.averageUpstreamMs },
    { label: "文件保存", value: queue.recent.averageFileSaveMs }
  ];

  function toggleJobSelection(id: string) {
    setSelectedJobIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleVisibleJobs() {
    const visibleIds = jobs.map((job) => job.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedJobIdSet.has(id));
    setSelectedJobIds(allSelected ? [] : visibleIds);
  }

  async function runSelectedAction(action: AdminJobAction) {
    if (selectedJobIds.length === 0 || !selectedSameStatus || !canRunJobAction(action, selectedStatus ?? "")) return;
    await onJobAction(action, selectedJobIds);
    setSelectedJobIds([]);
  }

  async function runRowAction(action: AdminJobAction, jobId: string) {
    await onJobAction(action, [jobId]);
    setSelectedJobIds((current) => current.filter((id) => id !== jobId));
  }

  return (
    <div className="admin-page-stack" data-testid="admin-monitor">
      <section className={`admin-monitor-hero is-${getStatusTone(queueState)}`}>
        <div className="admin-monitor-hero-copy">
          <p className="admin-console-kicker">任务监控</p>
          <h2>{queue.queue.ok ? "队列可用，持续观察失败率" : "队列连接异常，需要立即处理"}</h2>
          <p>
            {backendLabel} 当前有 {formatAdminNumber(activeTotal)} 个未完成任务，近 1 小时成功 {formatAdminNumber(queue.recentSucceeded)} 个、失败 {formatAdminNumber(queue.recentFailed)} 个。
          </p>
        </div>
        <div className="admin-monitor-hero-panel">
          <StatusBadge value={queueState} tone={getStatusTone(queueState)} />
          <strong>{formatAdminPercent(failureRate)}</strong>
          <span>近 1 小时失败率</span>
        </div>
        <button className="admin-icon-text-button" type="button" onClick={onRefresh} disabled={actionBusy}>
          <RefreshCw size={16} />
          刷新监控
        </button>
      </section>

      <div className="admin-metric-grid admin-metric-grid-compact">
        <MetricCard label="队列后端" value={backendLabel} detail={queue.queue.target} tone={queue.queue.ok ? "good" : "bad"} />
        <MetricCard label="配置来源" value={formatAdminConfigSource(queue.configSource)} detail={`版本 ${queue.configVersion ?? "-"}`} />
        <MetricCard label="Redis 目标" value={queue.redisTarget ?? queue.queue.target} detail={queue.redisConfigured ? "已配置" : "未配置"} tone={queue.redisConfigured ? "good" : "neutral"} />
        <MetricCard label="队列前缀" value={queue.queuePrefix ?? "-"} detail={formatAdminQueueMode(queue.backend)} />
        <MetricCard label="等待任务" value={formatAdminNumber(queue.pending)} detail={`已入队 ${formatAdminNumber(queue.queued)}`} tone={queue.pending > 0 ? "warn" : "neutral"} />
        <MetricCard label="运行任务" value={formatAdminNumber(queue.running)} detail={`活跃槽位 ${formatAdminNumber(queue.active)}`} tone={queue.running > 0 ? "warn" : "neutral"} />
        <MetricCard label="近 1 小时成功" value={formatAdminNumber(queue.recentSucceeded)} tone="good" />
        <MetricCard label="近 1 小时失败" value={formatAdminNumber(queue.recentFailed)} tone={queue.recentFailed > 0 ? "bad" : "neutral"} />
        <MetricCard label="平均供应商耗时" value={formatAdminMilliseconds(queue.recent.averageUpstreamMs)} />
      </div>

      <div className="admin-monitor-flow">
        <div className="admin-monitor-flow-card">
          <Route size={18} />
          <span>等待</span>
          <strong>{formatAdminNumber(queue.pending)}</strong>
        </div>
        <div className="admin-monitor-flow-card">
          <TimerReset size={18} />
          <span>运行</span>
          <strong>{formatAdminNumber(queue.running)}</strong>
        </div>
        <div className="admin-monitor-flow-card is-good">
          <CheckCircle2 size={18} />
          <span>成功</span>
          <strong>{formatAdminNumber(queue.recentSucceeded)}</strong>
        </div>
        <div className="admin-monitor-flow-card is-bad">
          <AlertTriangle size={18} />
          <span>失败</span>
          <strong>{formatAdminNumber(queue.recentFailed)}</strong>
        </div>
      </div>

      <AdminSection title="当前队列配置" description="确认设置保存后是否已进入 Web 调度器、Redis 队列和 Worker 运行时。">
        <div className="admin-data-list admin-queue-runtime-list">
          <div><span>Web 调度签名</span><strong>{queue.queueRuntimeVersion ?? "-"}</strong></div>
          <div><span>Worker 签名</span><strong>{queue.workerRuntimeVersion ?? "-"}</strong></div>
          <div><span>总并发</span><strong>{formatAdminNumber(queue.concurrency)}</strong></div>
          <div><span>单用户并发</span><strong>{formatAdminNumber(queue.userConcurrency)}</strong></div>
          <div><span>Worker 并发</span><strong>{formatAdminNumber(queue.workerConcurrency)}</strong></div>
          <div><span>重试策略</span><strong>{formatAdminNumber(queue.attempts)} 次 / {formatAdminMilliseconds(queue.backoffMs)}</strong></div>
        </div>
      </AdminSection>

      <div className="admin-split-grid admin-monitor-insight-grid">
        <AdminSection title="耗时拆解" description="最近任务平均耗时，用于定位排队、供应商或文件保存瓶颈。">
          <div className="admin-timing-list">
            {timingRows.map((item) => {
              const width = typeof item.value === "number" && Number.isFinite(item.value)
                ? Math.max(3, Math.round((item.value / longestAverage) * 100))
                : 0;

              return (
                <div className="admin-timing-row" key={item.label}>
                  <div>
                    <span>{item.label}</span>
                    <strong>{formatAdminMilliseconds(item.value)}</strong>
                  </div>
                  <div className="admin-timing-track" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminSection>

        <AdminSection title="失败原因" description="按最近失败任务聚合，优先处理高频错误。">
          <div className="admin-data-list">
            {queue.failureReasons.length > 0 ? queue.failureReasons.map((item) => (
              <div key={item.reason}>
                <span>{item.reason}</span>
                <strong>{formatAdminNumber(item.count)}</strong>
                <small>{item.sample}</small>
              </div>
            )) : (
              <EmptyState>最近没有失败任务。</EmptyState>
            )}
          </div>
        </AdminSection>

        <AdminSection title="供应商健康">
          <div className="admin-table-wrap">
            <table className="admin-table admin-provider-health-table">
              <thead>
                <tr>
                  <th>供应商</th>
                  <th>状态</th>
                  <th>成功/失败</th>
                  <th>失败率</th>
                  <th>平均上游</th>
                </tr>
              </thead>
              <tbody>
                {queue.providerHealth.length > 0 ? queue.providerHealth.map((item) => (
                  <tr key={item.provider}>
                    <td>{item.provider}</td>
                    <td><StatusBadge value={item.status} tone={getStatusTone(item.status)} /></td>
                    <td>{formatAdminNumber(item.succeeded)} / {formatAdminNumber(item.failed)}</td>
                    <td>{formatAdminPercent(item.failureRate)}</td>
                    <td>{formatAdminMilliseconds(item.averageUpstreamMs)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5}>暂无供应商任务。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>

        <AdminSection title="模型健康">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>供应商</th>
                  <th>成功/失败</th>
                  <th>平均执行</th>
                </tr>
              </thead>
              <tbody>
                {queue.modelUsage.length > 0 ? queue.modelUsage.map((item) => (
                  <tr key={`${item.provider}:${item.model}`}>
                    <td>{item.model}</td>
                    <td>{item.provider}</td>
                    <td>{formatAdminNumber(item.succeeded)} / {formatAdminNumber(item.failed)}</td>
                    <td>{formatAdminMilliseconds(item.averageExecutionMs)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>暂无模型任务。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="任务治理"
        description="支持按状态、用户、供应商、模型和时间筛选，并对同一状态任务执行重试、暂停、恢复或终止。"
        actions={(
          <button className="admin-icon-text-button" type="button" onClick={onRefresh} disabled={actionBusy}>
            <RefreshCw size={15} />
            刷新
          </button>
        )}
      >
        <div className="admin-filter-bar admin-job-filter-bar">
          <label className="admin-field">
            <span>状态</span>
            <select value={jobFilters.status} onChange={(event) => onJobFiltersChange({ status: event.target.value })}>
              <option value="">全部状态</option>
              <option value="pending">等待</option>
              <option value="paused">暂停</option>
              <option value="running">运行</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
            </select>
          </label>
          <label className="admin-field">
            <span>用户</span>
            <select value={jobFilters.userId} onChange={(event) => onJobFiltersChange({ userId: event.target.value })}>
              <option value="">全部用户</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.email}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>供应商</span>
            <input value={jobFilters.provider} placeholder="openai" onChange={(event) => onJobFiltersChange({ provider: event.target.value })} />
          </label>
          <label className="admin-field">
            <span>模型</span>
            <input value={jobFilters.model} placeholder="gpt-image-2" onChange={(event) => onJobFiltersChange({ model: event.target.value })} />
          </label>
          <label className="admin-field">
            <span>开始日期</span>
            <input type="date" value={jobFilters.dateFrom} onChange={(event) => onJobFiltersChange({ dateFrom: event.target.value })} />
          </label>
          <label className="admin-field">
            <span>结束日期</span>
            <input type="date" value={jobFilters.dateTo} onChange={(event) => onJobFiltersChange({ dateTo: event.target.value })} />
          </label>
          <label className="admin-field admin-filter-query">
            <span>搜索</span>
            <input value={jobFilters.q} placeholder="提示词 / 错误 / 模型" onChange={(event) => onJobFiltersChange({ q: event.target.value })} />
          </label>
          {filtersActive && (
            <button className="admin-icon-text-button" type="button" onClick={onResetJobFilters}>
              <X size={15} />
              重置
            </button>
          )}
        </div>

        {selectedJobIds.length > 0 && (
          <div className="admin-bulk-action-bar">
            <strong>{formatAdminNumber(selectedJobIds.length)} 个任务已选择</strong>
            {!selectedSameStatus && <span>批量操作需要选择同一状态任务</span>}
            <div className="admin-row-actions">
              <button className="admin-icon-text-button" type="button" disabled={actionBusy || !selectedSameStatus || !canRunJobAction("retry", selectedStatus ?? "")} onClick={() => void runSelectedAction("retry")}>
                <RotateCcw size={15} />
                重试
              </button>
              <button className="admin-icon-text-button" type="button" disabled={actionBusy || !selectedSameStatus || !canRunJobAction("pause", selectedStatus ?? "")} onClick={() => void runSelectedAction("pause")}>
                <PauseCircle size={15} />
                暂停
              </button>
              <button className="admin-icon-text-button" type="button" disabled={actionBusy || !selectedSameStatus || !canRunJobAction("resume", selectedStatus ?? "")} onClick={() => void runSelectedAction("resume")}>
                <PlayCircle size={15} />
                恢复
              </button>
              <button className="admin-icon-text-button is-danger" type="button" disabled={actionBusy || !selectedSameStatus || !canRunJobAction("kill", selectedStatus ?? "")} onClick={() => void runSelectedAction("kill")}>
                <Ban size={15} />
                终止
              </button>
            </div>
          </div>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table admin-monitor-table admin-jobs-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="选择当前页任务"
                    checked={jobs.length > 0 && jobs.every((job) => selectedJobIdSet.has(job.id))}
                    onChange={toggleVisibleJobs}
                  />
                </th>
                <th>用户</th>
                <th>状态</th>
                <th>模型</th>
                <th>提示词或错误</th>
                <th>失败分类</th>
                <th>排队/执行</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length > 0 ? jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择任务 ${job.id}`}
                      checked={selectedJobIdSet.has(job.id)}
                      onChange={() => toggleJobSelection(job.id)}
                    />
                  </td>
                  <td>{job.userEmail}</td>
                  <td><StatusBadge value={job.status} tone={getStatusTone(job.status)} /></td>
                  <td>{job.provider} / {job.model}</td>
                  <td title={job.error || job.prompt}>{job.error || job.prompt}</td>
                  <td>{formatFailureCategory(job.failureCategory)}</td>
                  <td>{formatAdminMilliseconds(job.queueWaitMs)} / {formatAdminMilliseconds(job.executionMs)}</td>
                  <td>{formatAdminDate(job.createdAt)}</td>
                  <td>
                    <AdminJobActionButtons
                      status={job.status}
                      busy={actionBusy}
                      onAction={(action) => void runRowAction(action, job.id)}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={9}>暂无任务。</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {jobNextCursor && (
          <button className="admin-icon-text-button admin-load-more-button" type="button" disabled={actionBusy} onClick={onLoadMoreJobs}>
            加载更多任务
          </button>
        )}
      </AdminSection>
    </div>
  );
}
