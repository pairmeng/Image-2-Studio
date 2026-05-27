import { RefreshCw } from "lucide-react";
import type { AdminAuditLogRecord } from "./utils/admin-api";
import { AdminSection, EmptyState } from "./admin-layout";
import { formatAdminDate } from "./utils/admin-format";

function formatAuditMetadata(metadata: AdminAuditLogRecord["metadata"]) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "-";

  return entries
    .map(([key, value]) => `${key}: ${String(value ?? "-")}`)
    .join(" · ");
}

export function AdminAudit({
  logs,
  nextCursor,
  busy,
  onRefresh,
  onLoadMore
}: {
  logs: AdminAuditLogRecord[];
  nextCursor?: string;
  busy: string;
  onRefresh: () => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="admin-page-stack" data-testid="admin-audit">
      <AdminSection
        title="审计日志"
        description="记录管理员登录、用户管理、平台设置、供应商和队列配置变更。敏感字段只保留脱敏摘要。"
        actions={(
          <button className="admin-icon-text-button" type="button" onClick={onRefresh} disabled={Boolean(busy)}>
            <RefreshCw size={16} />
            刷新
          </button>
        )}
      >
        <div className="admin-table-wrap">
          <table className="admin-table admin-audit-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>管理员</th>
                <th>动作</th>
                <th>目标</th>
                <th>摘要</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatAdminDate(log.createdAt)}</td>
                  <td>{log.adminUserId}</td>
                  <td>{log.action}</td>
                  <td>{log.targetType}{log.targetId ? ` / ${log.targetId}` : ""}</td>
                  <td title={formatAuditMetadata(log.metadata)}>{formatAuditMetadata(log.metadata)}</td>
                  <td>{log.ipAddress || "-"}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}><EmptyState>暂无审计记录。</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="admin-load-more">
            <button className="admin-icon-text-button" type="button" onClick={onLoadMore} disabled={Boolean(busy)}>
              加载更多
            </button>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
