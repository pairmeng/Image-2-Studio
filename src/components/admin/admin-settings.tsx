import { Check } from "lucide-react";
import type { AdminOverview } from "./utils/admin-api";
import { AdminSection, EmptyState, StatusBadge } from "./admin-layout";
import { formatAdminConfigSource, formatAdminQueueMode } from "./utils/admin-format";

export function AdminSettings({
  overview,
  queueRedisUrl,
  clearQueueRedisUrl,
  busy,
  onSettingsChange,
  onQueueRedisUrlChange,
  onClearQueueRedisUrlChange,
  onSaveSettings
}: {
  overview: AdminOverview | null;
  queueRedisUrl: string;
  clearQueueRedisUrl: boolean;
  busy: string;
  onSettingsChange: (next: Partial<AdminOverview["settings"]>) => void;
  onQueueRedisUrlChange: (value: string) => void;
  onClearQueueRedisUrlChange: (value: boolean) => void;
  onSaveSettings: () => void;
}) {
  if (!overview) {
    return <EmptyState>正在加载平台设置。</EmptyState>;
  }

  const queueSettings = overview.settings;
  const queueMode = queueSettings.imageQueueMode;
  const redisFieldsDisabled = queueMode !== "redis";

  return (
    <div className="admin-page-stack" data-testid="admin-settings">
      <AdminSection
        title="平台设置"
        description="控制站点品牌、注册入口和平台 key 每日额度。"
        actions={(
          <button className="admin-primary-button" type="button" onClick={onSaveSettings} disabled={Boolean(busy)}>
            <Check size={16} />
            保存设置
          </button>
        )}
      >
        <div className="admin-form-grid admin-settings-form-grid">
          <label className="admin-field">
            <span>站点标题</span>
            <input
              value={overview.settings.siteTitle ?? ""}
              maxLength={80}
              placeholder="Image-2 Studio"
              onChange={(event) => onSettingsChange({ siteTitle: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Logo 地址</span>
            <input
              value={overview.settings.logoUrl ?? ""}
              maxLength={500}
              placeholder="/logo.png"
              onChange={(event) => onSettingsChange({ logoUrl: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Favicon 地址</span>
            <input
              value={overview.settings.faviconUrl ?? ""}
              maxLength={500}
              placeholder="/favicon.ico"
              onChange={(event) => onSettingsChange({ faviconUrl: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>平台每日额度</span>
            <input
              type="number"
              min="0"
              value={overview.settings.dailyPlatformQuota}
              onChange={(event) => onSettingsChange({ dailyPlatformQuota: Number(event.target.value) })}
            />
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={overview.settings.registrationOpen}
              onChange={(event) => onSettingsChange({ registrationOpen: event.target.checked })}
            />
            <span>
              <strong>允许自行注册</strong>
              <small>关闭后只能由管理员创建用户。</small>
            </span>
          </label>
        </div>
      </AdminSection>

      <AdminSection
        title="队列与并发"
        description="配置任务调度方式、Redis 连接和并发上限；Redis URL 保存后只展示脱敏目标。"
        actions={(
          <button className="admin-primary-button" type="button" onClick={onSaveSettings} disabled={Boolean(busy)}>
            <Check size={16} />
            保存队列
          </button>
        )}
      >
        <div className="admin-queue-status-grid">
          <div className="admin-provider-head">
            <div>
              <strong>{formatAdminQueueMode(queueMode)}</strong>
              <span>来源：{formatAdminConfigSource(queueSettings.imageQueueConfigSource)} · 版本 {queueSettings.imageQueueConfigVersion}</span>
            </div>
            <StatusBadge
              value={queueSettings.imageQueueRedisConfigured ? "configured" : "missing"}
              tone={queueSettings.imageQueueRedisConfigured ? "good" : queueMode === "redis" ? "warn" : "neutral"}
            />
          </div>
          <div className="admin-provider-head">
            <div>
              <strong>{queueSettings.imageQueueRedisTarget || "disabled"}</strong>
              <span>当前 Redis 目标</span>
            </div>
            <StatusBadge value={queueMode} label={formatAdminQueueMode(queueMode)} tone={queueMode === "redis" ? "good" : "neutral"} />
          </div>
        </div>

        <div className="admin-form-grid admin-queue-form-grid">
          <div className="admin-field">
            <span>队列模式</span>
            <div className="admin-segmented-control" role="group" aria-label="队列模式">
              {(["inline", "redis"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={queueMode === mode ? "is-active" : ""}
                  aria-pressed={queueMode === mode}
                  onClick={() => onSettingsChange({ imageQueueMode: mode })}
                >
                  {formatAdminQueueMode(mode)}
                </button>
              ))}
            </div>
          </div>
          <label className="admin-field">
            <span>总并发</span>
            <input
              type="number"
              min="1"
              max="8"
              value={queueSettings.imageJobConcurrency}
              onChange={(event) => onSettingsChange({ imageJobConcurrency: Number(event.target.value) })}
            />
          </label>
          <label className="admin-field">
            <span>单用户并发</span>
            <input
              type="number"
              min="1"
              max={Math.max(1, queueSettings.imageJobConcurrency)}
              value={queueSettings.imageJobUserConcurrency}
              onChange={(event) => onSettingsChange({ imageJobUserConcurrency: Number(event.target.value) })}
            />
          </label>
          <label className={`admin-field ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <span>Redis URL</span>
            <input
              type="password"
              value={queueRedisUrl}
              placeholder="留空则不替换现有 Redis URL"
              onChange={(event) => onQueueRedisUrlChange(event.target.value)}
            />
          </label>
          <label className={`admin-field ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <span>队列前缀</span>
            <input
              value={queueSettings.imageQueuePrefix}
              maxLength={40}
              placeholder="image2"
              onChange={(event) => onSettingsChange({ imageQueuePrefix: event.target.value })}
            />
          </label>
          <label className={`admin-field ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <span>Worker 并发</span>
            <input
              type="number"
              min="1"
              max="64"
              value={queueSettings.imageWorkerConcurrency}
              onChange={(event) => onSettingsChange({ imageWorkerConcurrency: Number(event.target.value) })}
            />
          </label>
          <label className={`admin-field ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <span>重试次数</span>
            <input
              type="number"
              min="1"
              max="20"
              value={queueSettings.imageQueueAttempts}
              onChange={(event) => onSettingsChange({ imageQueueAttempts: Number(event.target.value) })}
            />
          </label>
          <label className={`admin-field ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <span>退避时间 ms</span>
            <input
              type="number"
              min="0"
              max="600000"
              step="500"
              value={queueSettings.imageQueueBackoffMs}
              onChange={(event) => onSettingsChange({ imageQueueBackoffMs: Number(event.target.value) })}
            />
          </label>
          <label className={`admin-toggle admin-queue-clear-toggle ${redisFieldsDisabled ? "is-muted" : ""}`}>
            <input
              type="checkbox"
              checked={clearQueueRedisUrl}
              onChange={(event) => onClearQueueRedisUrlChange(event.target.checked)}
            />
            <span>
              <strong>清除已保存 Redis URL</strong>
              <small>勾选后保存会移除数据库中的 Redis 地址。</small>
            </span>
          </label>
        </div>
      </AdminSection>

    </div>
  );
}
