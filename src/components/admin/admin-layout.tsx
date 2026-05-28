import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  FileClock,
  Gauge,
  ImageIcon,
  Plug,
  Settings,
  Users
} from "lucide-react";
import type { AdminTab } from "./hooks/use-admin-console";
import { formatAdminStatusLabel } from "./utils/admin-format";

export const adminTabs: Array<{
  id: AdminTab;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  { id: "overview", label: "概览", description: "平台运行摘要", icon: <Gauge size={18} /> },
  { id: "settings", label: "平台设置", description: "品牌与供应商", icon: <Settings size={18} /> },
  { id: "providers", label: "供应商管理", description: "模型与密钥", icon: <Plug size={18} /> },
  { id: "users", label: "用户管理", description: "账号与角色", icon: <Users size={18} /> },
  { id: "usage", label: "用量统计", description: "趋势和排行", icon: <BarChart3 size={18} /> },
  { id: "monitor", label: "平台监控", description: "队列和失败", icon: <Activity size={18} /> },
  { id: "images", label: "图片审查", description: "全平台图库", icon: <ImageIcon size={18} /> },
  { id: "audit", label: "审计日志", description: "敏感操作追踪", icon: <FileClock size={18} /> }
];

export function AdminShell({
  activeTab,
  onTabChange,
  children,
  message,
  error,
  busy
}: {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: ReactNode;
  message: string;
  error: string;
  busy: string;
}) {
  const active = adminTabs.find((tab) => tab.id === activeTab) ?? adminTabs[0];

  return (
    <div className={`admin-console-page admin-console-page-${activeTab}`} data-admin-tab={activeTab}>
      <aside className="admin-console-sidebar" aria-label="管理后台导航">
        <Link className="admin-console-brand" href="/">
          <span className="admin-console-brand-mark">I2</span>
          <span>
            <strong>Image-2 管理台</strong>
            <small>运营控制台 V2</small>
          </span>
        </Link>
        <nav className="admin-console-nav">
          {adminTabs.map((tab) => (
            <button
              key={tab.id}
              className={`admin-console-nav-item ${activeTab === tab.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon}
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="admin-console-main">
        <header className="admin-console-header">
          <div>
            <p className="admin-console-kicker">运营后台</p>
            <h1>{active.label}</h1>
            <p>{active.description}</p>
          </div>
          <div className="admin-console-header-actions">
            <Link className="admin-link-button" href="/">
              返回工作台
            </Link>
          </div>
        </header>

        {(message || error || busy) && (
          <div className={`admin-console-status ${error ? "is-error" : ""}`} role="status">
            <span>{error || message || "正在处理..."}</span>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="admin-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className={`admin-metric-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="admin-empty-state">{children}</p>;
}

export function StatusBadge({
  value,
  tone = "neutral",
  label
}: {
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  label?: string;
}) {
  return <span className={`admin-status-badge is-${tone}`}>{label ?? formatAdminStatusLabel(value)}</span>;
}
