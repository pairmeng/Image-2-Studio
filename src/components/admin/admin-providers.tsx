import { Check, Plug, Plus, TestTube2 } from "lucide-react";
import { AdminSection, EmptyState, StatusBadge } from "./admin-layout";
import type { AdminProviderSaveInput, AdminProviderSetting, AdminProvidersResponse } from "./utils/admin-api";
import { formatAdminProviderAdapter } from "./utils/admin-format";

export function AdminProviders({
  providers,
  selectedProviderId,
  draft,
  busy,
  onSelectProvider,
  onDraftChange,
  onAddProvider,
  onSaveProvider,
  onTestProvider
}: {
  providers: AdminProvidersResponse | null;
  selectedProviderId: string;
  draft: AdminProviderSaveInput;
  busy: string;
  onSelectProvider: (provider: AdminProviderSetting) => void;
  onDraftChange: (next: Partial<AdminProviderSaveInput>) => void;
  onAddProvider: () => void;
  onSaveProvider: () => void;
  onTestProvider: (providerId: string) => void;
}) {
  if (!providers) {
    return <EmptyState>正在加载供应商配置。</EmptyState>;
  }

  return (
    <div className="admin-page-stack" data-testid="admin-providers">
      <div className="admin-metric-grid">
        <div className="admin-metric-card is-good">
          <span>已启用供应商</span>
          <strong>{providers.providers.filter((provider) => provider.enabled).length}</strong>
          <small>用户 catalog 会展示这些供应商。</small>
        </div>
        <div className="admin-metric-card is-neutral">
          <span>已配置密钥</span>
          <strong>{providers.providers.filter((provider) => provider.configured).length}</strong>
          <small>密钥仅保存加密值。</small>
        </div>
        <div className="admin-metric-card is-warn">
          <span>可用 Adapter</span>
          <strong>{providers.adapters.length}</strong>
          <small>新增供应商需要选择执行适配器。</small>
        </div>
      </div>

      <AdminSection
        title="供应商列表"
        description="配置平台级供应商、模型能力和健康状态。"
        actions={(
          <button className="admin-secondary-button" type="button" onClick={onAddProvider} disabled={Boolean(busy)}>
            <Plus size={16} />
            新增供应商
          </button>
        )}
      >
        <div className="admin-provider-list">
          {providers.providers.map((provider) => (
            <button
              type="button"
              key={provider.providerId}
              className={`admin-provider-list-item ${selectedProviderId === provider.providerId ? "is-active" : ""}`}
              onClick={() => onSelectProvider(provider)}
            >
              <Plug size={18} />
              <span>
                <strong>{provider.label}</strong>
                <small>{provider.providerId} · {formatAdminProviderAdapter(provider.adapterId)} · {provider.defaultModel || "-"}</small>
              </span>
              <StatusBadge value={provider.enabled ? "enabled" : "disabled"} tone={provider.enabled ? "good" : "bad"} />
              <StatusBadge value={provider.configured ? "configured" : "missing"} tone={provider.configured ? "good" : "warn"} />
            </button>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="供应商配置"
        description="API Key 留空表示不替换现有密钥；模型列表每行一个 modelId，可用冒号追加展示名。"
        actions={(
          <>
            <button className="admin-secondary-button" type="button" onClick={() => onTestProvider(draft.providerId)} disabled={Boolean(busy) || !draft.providerId}>
              <TestTube2 size={16} />
              测试连接
            </button>
            <button className="admin-primary-button" type="button" onClick={onSaveProvider} disabled={Boolean(busy) || !draft.providerId}>
              <Check size={16} />
              保存供应商
            </button>
          </>
        )}
      >
        <div className="admin-form-grid admin-provider-form-grid">
          <label className="admin-field">
            <span>Provider ID</span>
            <input
              value={draft.providerId}
              maxLength={64}
              placeholder="openai"
              onChange={(event) => onDraftChange({ providerId: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>名称</span>
            <input
              value={draft.label}
              maxLength={80}
              placeholder="OpenAI"
              onChange={(event) => onDraftChange({ label: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Adapter</span>
            <select value={draft.adapterId} onChange={(event) => onDraftChange({ adapterId: event.target.value as AdminProviderSaveInput["adapterId"] })}>
              {providers.adapters.map((adapter) => (
                <option key={adapter.adapterId} value={adapter.adapterId}>{formatAdminProviderAdapter(adapter.adapterId)}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>优先级</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={draft.priority}
              onChange={(event) => onDraftChange({ priority: Number(event.target.value) })}
            />
          </label>
          <label className="admin-field">
            <span>API Key</span>
            <input
              type="password"
              value={draft.key}
              placeholder="已配置时留空不替换"
              autoComplete="off"
              onChange={(event) => onDraftChange({ key: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Base URL</span>
            <input
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => onDraftChange({ baseUrl: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>默认模型</span>
            <input
              value={draft.defaultModel}
              placeholder="gpt-image-2"
              onChange={(event) => onDraftChange({ defaultModel: event.target.value })}
            />
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => onDraftChange({ enabled: event.target.checked })}
            />
            <span>
              <strong>启用供应商</strong>
              <small>关闭后用户不能选择该供应商创建新任务。</small>
            </span>
          </label>
          <label className="admin-field admin-field-wide">
            <span>模型列表</span>
            <textarea
              value={draft.models.map((model) => `${model.modelId}${model.label && model.label !== model.modelId ? `:${model.label}` : ""}`).join("\n")}
              placeholder={"gpt-image-2:GPT Image 2\ncustom-image-model"}
              rows={5}
              onChange={(event) => onDraftChange({ models: parseModelsText(event.target.value) })}
            />
          </label>
        </div>
      </AdminSection>
    </div>
  );
}

function parseModelsText(value: string): AdminProviderSaveInput["models"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [modelId, ...labelParts] = line.split(":");
      const label = labelParts.join(":").trim();
      return {
        modelId: modelId.trim(),
        label: label || undefined
      };
    })
    .filter((item) => item.modelId);
}
