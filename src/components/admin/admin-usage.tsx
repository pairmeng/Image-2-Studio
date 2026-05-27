import { RefreshCw } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import type { AdminUsageResponse } from "./utils/admin-api";
import { AdminSection, EmptyState, MetricCard } from "./admin-layout";
import { formatAdminDay, formatAdminNumber } from "./utils/admin-format";

export function AdminUsage({
  usage,
  users,
  range,
  userId,
  busy,
  onRangeChange,
  onUserIdChange,
  onRefresh
}: {
  usage: AdminUsageResponse | null;
  users: PublicUser[];
  range: "7d" | "30d";
  userId: string;
  busy: string;
  onRangeChange: (value: "7d" | "30d") => void;
  onUserIdChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const maxDailyValue = Math.max(1, ...(usage?.daily.map((item) => item.platformUses + item.images + item.failedJobs + item.succeededJobs) ?? [1]));
  const totals = usage?.daily.reduce((acc, item) => ({
    platformUses: acc.platformUses + item.platformUses,
    images: acc.images + item.images,
    succeededJobs: acc.succeededJobs + item.succeededJobs,
    failedJobs: acc.failedJobs + item.failedJobs
  }), { platformUses: 0, images: 0, succeededJobs: 0, failedJobs: 0 });

  return (
    <div className="admin-page-stack" data-testid="admin-usage">
      <AdminSection
        title="用量筛选"
        description="按 7/30 天和指定用户查看平台额度、生成图片、任务结果。"
        actions={(
          <button className="admin-icon-text-button" type="button" onClick={onRefresh} disabled={Boolean(busy)}>
            <RefreshCw size={16} />
            刷新
          </button>
        )}
      >
        <div className="admin-filter-bar">
          <div className="admin-field">
            <span>范围</span>
            <div className="admin-segmented-control" role="group" aria-label="用量统计范围">
              <button className={range === "7d" ? "is-active" : ""} type="button" aria-pressed={range === "7d"} onClick={() => onRangeChange("7d")}>
                近 7 天
              </button>
              <button className={range === "30d" ? "is-active" : ""} type="button" aria-pressed={range === "30d"} onClick={() => onRangeChange("30d")}>
                近 30 天
              </button>
            </div>
          </div>
          <label className="admin-field">
            <span>用户</span>
            <select value={userId} onChange={(event) => onUserIdChange(event.target.value)}>
              <option value="">全部用户</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.email}</option>
              ))}
            </select>
          </label>
        </div>
      </AdminSection>

      {!usage ? (
        <EmptyState>正在加载用量统计。</EmptyState>
      ) : (
        <>
          <div className="admin-metric-grid admin-usage-metrics">
            <MetricCard label="平台额度" value={formatAdminNumber(totals?.platformUses ?? 0)} />
            <MetricCard label="生成图片" value={formatAdminNumber(totals?.images ?? 0)} tone="good" />
            <MetricCard label="成功任务" value={formatAdminNumber(totals?.succeededJobs ?? 0)} />
            <MetricCard label="失败任务" value={formatAdminNumber(totals?.failedJobs ?? 0)} tone={(totals?.failedJobs ?? 0) > 0 ? "warn" : "neutral"} />
          </div>

          <AdminSection title="日期趋势" description="按 Asia/Shanghai 日期聚合。">
            <div className="admin-chart">
              {usage.daily.map((item) => {
                const total = item.platformUses + item.images + item.succeededJobs + item.failedJobs;
                const height = Math.max(4, Math.round((total / maxDailyValue) * 100));
                return (
                  <div className="admin-chart-column" key={item.date}>
                    <div className="admin-chart-bar" style={{ height: `${height}%` }} title={`${item.date}: ${total}`} />
                    <span>{formatAdminDay(item.date)}</span>
                  </div>
                );
              })}
            </div>
          </AdminSection>

          <div className="admin-split-grid">
            <AdminSection title="用户排行">
              <div className="admin-table-wrap">
                <table className="admin-table admin-usage-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>平台额度</th>
                      <th>图片</th>
                      <th>失败</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.users.length > 0 ? usage.users.map((item) => (
                      <tr key={item.userId}>
                        <td>{item.userEmail}</td>
                        <td>{formatAdminNumber(item.platformUses)}</td>
                        <td>{formatAdminNumber(item.images)}</td>
                        <td>{formatAdminNumber(item.failedJobs)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4}>暂无用户用量。</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </AdminSection>

            <AdminSection title="模型分布">
              <div className="admin-table-wrap">
                <table className="admin-table admin-usage-table">
                  <thead>
                    <tr>
                      <th>供应商</th>
                      <th>模型</th>
                      <th>图片</th>
                      <th>任务</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.models.length > 0 ? usage.models.map((item) => (
                      <tr key={`${item.provider}:${item.model}`}>
                        <td>{item.provider}</td>
                        <td>{item.model}</td>
                        <td>{formatAdminNumber(item.images)}</td>
                        <td>{formatAdminNumber(item.jobs)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4}>暂无模型用量。</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </AdminSection>
          </div>
        </>
      )}
    </div>
  );
}
