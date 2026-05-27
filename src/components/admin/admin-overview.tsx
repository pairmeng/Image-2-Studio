import { RefreshCw } from "lucide-react";
import type { AdminOverview as AdminOverviewData } from "./utils/admin-api";
import { AdminSection, EmptyState, MetricCard, StatusBadge } from "./admin-layout";
import {
  formatAdminConfigSource,
  formatAdminDate,
  formatAdminMilliseconds,
  formatAdminNumber,
  formatAdminQueueBackend,
  formatAdminQueueMode,
  getStatusTone
} from "./utils/admin-format";

export function AdminOverview({
  overview,
  busy,
  onRefresh
}: {
  overview: AdminOverviewData | null;
  busy: string;
  onRefresh: () => void;
}) {
  if (!overview) {
    return <EmptyState>正在加载管理概览。</EmptyState>;
  }

  return (
    <div className="admin-page-stack" data-testid="admin-overview">
      <AdminSection
        title="运行摘要"
        description="用户、图片、今日额度和近 1 小时任务状态。"
        actions={(
          <button className="admin-icon-text-button" type="button" onClick={onRefresh} disabled={Boolean(busy)}>
            <RefreshCw size={16} />
            刷新
          </button>
        )}
      >
        <div className="admin-metric-grid admin-overview-metrics">
          <MetricCard label="用户总数" value={formatAdminNumber(overview.totals.users)} detail={`${overview.totals.disabledUsers} 个已禁用`} />
          <MetricCard label="图片总数" value={formatAdminNumber(overview.totals.images)} detail={`今日 ${formatAdminNumber(overview.today.generatedImages)}`} tone="good" />
          <MetricCard label="任务总数" value={formatAdminNumber(overview.totals.jobs)} detail={`失败 ${formatAdminNumber(overview.today.failedJobs)}`} tone={overview.today.failedJobs > 0 ? "warn" : "neutral"} />
          <MetricCard label="今日平台额度" value={formatAdminNumber(overview.today.platformUses)} detail={`每日上限 ${formatAdminNumber(overview.settings.dailyPlatformQuota)}`} />
          <MetricCard label="等待任务" value={formatAdminNumber(overview.jobQueue.pending)} detail={`运行中 ${formatAdminNumber(overview.jobQueue.running)}`} tone={overview.jobQueue.pending > 0 ? "warn" : "neutral"} />
          <MetricCard label="近 1 小时成功" value={formatAdminNumber(overview.jobQueue.recentSucceeded)} detail={`失败 ${formatAdminNumber(overview.jobQueue.recentFailed)}`} tone={overview.jobQueue.recentFailed > 0 ? "warn" : "good"} />
        </div>
      </AdminSection>

      <AdminSection title="队列健康" description="当前后端队列、并发和最近耗时。">
        <div className="admin-split-grid admin-overview-health-grid">
          <div className="admin-data-list">
            <div><span>后端</span><strong>{formatAdminQueueBackend(overview.jobQueue.backend, overview.jobQueue.queue.enabled)}</strong></div>
            <div><span>连接</span><StatusBadge value={overview.jobQueue.queue.ok ? "healthy" : "failing"} tone={overview.jobQueue.queue.ok ? "good" : "bad"} /></div>
            <div><span>配置来源</span><strong>{formatAdminConfigSource(overview.jobQueue.configSource ?? overview.settings.imageQueueConfigSource)}</strong></div>
            <div><span>队列模式</span><strong>{formatAdminQueueMode(overview.settings.imageQueueMode)}</strong></div>
            <div><span>并发</span><strong>{overview.jobQueue.concurrency} / 用户 {overview.jobQueue.userConcurrency}</strong></div>
            <div><span>Worker</span><strong>{overview.jobQueue.workerConcurrency ?? overview.settings.imageWorkerConcurrency}</strong></div>
            <div><span>Redis</span><strong>{overview.jobQueue.redisTarget ?? overview.settings.imageQueueRedisTarget}</strong></div>
            <div><span>前缀</span><strong>{overview.jobQueue.queuePrefix ?? overview.settings.imageQueuePrefix}</strong></div>
            <div><span>平均排队</span><strong>{formatAdminMilliseconds(overview.jobQueue.recent.averageQueueWaitMs)}</strong></div>
            <div><span>平均执行</span><strong>{formatAdminMilliseconds(overview.jobQueue.recent.averageExecutionMs)}</strong></div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>供应商</th>
                  <th>状态</th>
                  <th>成功/失败</th>
                  <th>平均上游</th>
                </tr>
              </thead>
              <tbody>
                {overview.jobQueue.providerHealth.length > 0 ? overview.jobQueue.providerHealth.map((item) => (
                  <tr key={item.provider}>
                    <td>{item.provider}</td>
                    <td><StatusBadge value={item.status} tone={getStatusTone(item.status)} /></td>
                    <td>{formatAdminNumber(item.succeeded)} / {formatAdminNumber(item.failed)}</td>
                    <td>{formatAdminMilliseconds(item.averageUpstreamMs)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>暂无最近任务。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="最近图片与用量" description="来自旧 overview 的兼容数据，便于快速检查。">
        <div className="admin-split-grid admin-overview-secondary-grid">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>模型</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {overview.images.length > 0 ? overview.images.slice(0, 8).map((image) => (
                  <tr key={image.id}>
                    <td>{image.userEmail}</td>
                    <td>{image.model}</td>
                    <td>{formatAdminDate(image.createdAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}>暂无图片。</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>日期</th>
                  <th>平台额度</th>
                </tr>
              </thead>
              <tbody>
                {overview.usage.length > 0 ? overview.usage.slice(0, 8).map((item) => (
                  <tr key={item.id}>
                    <td>{item.userEmail}</td>
                    <td>{item.date}</td>
                    <td>{formatAdminNumber(item.platformUses)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}>暂无用量。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
