import { Check } from "lucide-react";
import type { AdminOverview } from "./utils/admin-api";
import { AdminSection, EmptyState, StatusBadge } from "./admin-layout";
import { formatAdminConfigSource, formatAdminQueueMode } from "./utils/admin-format";

export function AdminSettings({
  overview,
  providerKey,
  providerBaseUrl,
  providerModel,
  queueRedisUrl,
  clearQueueRedisUrl,
  busy,
  onSettingsChange,
  onProviderKeyChange,
  onProviderBaseUrlChange,
  onProviderModelChange,
  onQueueRedisUrlChange,
  onClearQueueRedisUrlChange,
  onSaveSettings,
  onSaveProvider
}: {
  overview: AdminOverview | null;
  providerKey: string;
  providerBaseUrl: string;
  providerModel: string;
  queueRedisUrl: string;
  clearQueueRedisUrl: boolean;
  busy: string;
  onSettingsChange: (next: Partial<AdminOverview["settings"]>) => void;
  onProviderKeyChange: (value: string) => void;
  onProviderBaseUrlChange: (value: string) => void;
  onProviderModelChange: (value: string) => void;
  onQueueRedisUrlChange: (value: string) => void;
  onClearQueueRedisUrlChange: (value: boolean) => void;
  onSaveSettings: () => void;
  onSaveProvider: () => void;
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

      <AdminSection
        title="平台供应商"
        description="平台 OpenAI 配置只显示是否已配置，密钥不回显明文。"
        actions={(
          <button className="admin-primary-button" type="button" onClick={onSaveProvider} disabled={Boolean(busy)}>
            <Check size={16} />
            保存供应商
          </button>
        )}
      >
        <div className="admin-provider-head">
          <div>
            <strong>OpenAI</strong>
            <span>平台兜底供应商</span>
          </div>
          <StatusBadge
            value={overview.platformProvider.keys.openai?.configured ? "configured" : "missing"}
            tone={overview.platformProvider.keys.openai?.configured ? "good" : "warn"}
          />
        </div>
        <div className="admin-form-grid admin-provider-form-grid">
          <label className="admin-field">
            <span>OpenAI 平台密钥</span>
            <input
              type="password"
              value={providerKey}
              placeholder="留空则不替换现有 key"
              onChange={(event) => onProviderKeyChange(event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>接口地址</span>
            <input
              value={providerBaseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => onProviderBaseUrlChange(event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>模型覆盖</span>
            <input
              value={providerModel}
              placeholder="gpt-image-2"
              onChange={(event) => onProviderModelChange(event.target.value)}
            />
          </label>
        </div>
      </AdminSection>
    </div>
  );
}
