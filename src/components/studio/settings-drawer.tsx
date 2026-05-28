import { Check, Loader2, X } from "lucide-react";
import type { CatalogResponse } from "@/lib/types";
import type { HistoryFilter } from "@/components/studio/state/studio-context";
import type { Locale } from "@/components/studio/utils/copy";

type SettingsDrawerProps = {
  open: boolean;
  catalog: CatalogResponse | null;
  provider: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  userOpenaiKeyConfigured: boolean;
  savingSettings: boolean;
  settingsMessage: string;
  locale: Locale;
  historyFilter: HistoryFilter;
  t: (key: string) => string;
  onClose: () => void;
  onProviderChange: (provider: string) => void;
  onOpenaiKeyChange: (value: string) => void;
  onOpenaiBaseUrlChange: (value: string) => void;
  onOpenaiModelChange: (value: string) => void;
  onSaveProviderSettings: () => void;
  onHistoryFilterChange: (updater: HistoryFilter | ((current: HistoryFilter) => HistoryFilter)) => void;
};

export function SettingsDrawer({
  open,
  catalog,
  provider,
  openaiKey,
  openaiBaseUrl,
  openaiModel,
  userOpenaiKeyConfigured,
  savingSettings,
  settingsMessage,
  locale,
  historyFilter,
  t,
  onClose,
  onProviderChange,
  onOpenaiKeyChange,
  onOpenaiBaseUrlChange,
  onOpenaiModelChange,
  onSaveProviderSettings,
  onHistoryFilterChange
}: SettingsDrawerProps) {
  const selectedProvider = catalog?.providers.find((item) => item.provider === provider);
  const providerLabel = selectedProvider?.label ?? t("provider");

  return (
    <aside className={`settings-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div>
          <p className="section-label">{t("settings")}</p>
          <h2>{t("apiProvider")}</h2>
        </div>
        <button className="icon-button" type="button" title={t("closePreview")} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <section className="drawer-section">
        <p className="section-label">{t("provider")}</p>
        <div className="provider-pills">
          {catalog?.providers.map((item) => (
            <button
              className={`provider-pill ${provider === item.provider ? "is-selected" : ""}`}
              key={item.provider}
              onClick={() => onProviderChange(item.provider)}
              type="button"
            >
              <span>{item.label}</span>
              <span className={`status-dot ${item.configured ? "is-ready" : ""}`} title={item.configured ? t("ready") : t("missingKey")} />
            </button>
          ))}
        </div>
      </section>

      <section className="drawer-section">
        <p className="section-label">{t("apiKeys")}</p>
        <div className="filter-stack">
          <label className="key-field">
            <span>{providerLabel} API Key</span>
            <input
              className="field"
              value={openaiKey}
              onChange={(event) => onOpenaiKeyChange(event.target.value)}
              placeholder={userOpenaiKeyConfigured ? t("configuredReplace") : "sk-..."}
              type="password"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className="drawer-section">
        <p className="section-label">{providerLabel}</p>
        <div className="filter-stack">
          <label className="key-field">
            <span>{t("baseUrl")}</span>
            <input
              className="field"
              value={openaiBaseUrl}
              onChange={(event) => onOpenaiBaseUrlChange(event.target.value)}
              placeholder="https://api.example.com/v1"
              type="url"
            />
          </label>
          <label className="key-field">
            <span>{t("modelId")}</span>
            <input
              className="field"
              value={openaiModel}
              onChange={(event) => onOpenaiModelChange(event.target.value)}
              placeholder="gpt-image-2 or provider image model"
              type="text"
            />
          </label>
          <p className="settings-note">
            {t("baseUrlNote")}
          </p>
        </div>
      </section>

      <section className="drawer-section drawer-save-section">
        <button className="primary-button drawer-save" type="button" disabled={savingSettings} onClick={onSaveProviderSettings}>
          {savingSettings ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
          {savingSettings ? t("saving") : t("saveKeys")}
        </button>
        {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
        <p className="settings-note">{locale === "zh" ? "会同时保存供应商、API 密钥、Base URL 和模型覆盖。" : "Saves provider, API keys, Base URL, and model overrides together."}</p>
      </section>

      <section className="drawer-section">
        <p className="section-label">{t("historyFilter")}</p>
        <div className="filter-stack">
          <select
            className="select"
            value={historyFilter.provider}
            onChange={(event) => onHistoryFilterChange((current) => ({ ...current, provider: event.target.value as HistoryFilter["provider"] }))}
            aria-label={t("provider")}
          >
            <option value="all">{t("allProviders")}</option>
            {catalog?.providers.map((item) => (
              <option key={item.provider} value={item.provider}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={historyFilter.model}
            onChange={(event) => onHistoryFilterChange((current) => ({ ...current, model: event.target.value }))}
            aria-label={t("model")}
          >
            <option value="all">{t("allModels")}</option>
            {catalog?.models.map((item) => (
              <option key={`${item.provider}:${item.modelId}`} value={item.modelId}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </aside>
  );
}
