import { useEffect, useMemo, useState } from "react";
import type { CatalogResponse } from "@/lib/types";
import { fetchJson } from "@/components/studio/utils/api-client";

export type Branding = {
  siteTitle: string;
  faviconUrl: string;
  logoUrl: string;
};

type ProviderSettingsResponse = {
  activeProvider?: string;
  keys: Record<string, { configured: boolean; source: "user" | "platform" | "env" | "none" }>;
  baseUrls: Partial<Record<string, string>>;
  models: Partial<Record<string, string>>;
};

type CatalogDefaultSelection = {
  provider: string;
  modelId?: string;
  defaultAspectRatio: string;
  defaultResolution: string;
  defaultQuality: string;
  defaultInputFidelity: string;
};

type UseStudioCatalogOptions = {
  provider: string;
  defaultSiteTitle: string;
  defaultResolution: string;
  officialOpenAIResolution: string;
  messages: {
    catalogLoadFailed: string;
    settingsLoadFailed: string;
    settingsSaveFailed: string;
    keySaved: string;
  };
  onUnauthorized: (errorOrResponse: unknown) => boolean;
  onActiveProviderChange: (provider: string) => void;
  onCatalogDefaultSelection: (selection: CatalogDefaultSelection) => void;
};

export function useStudioCatalog({
  provider,
  defaultSiteTitle,
  defaultResolution,
  officialOpenAIResolution,
  messages,
  onUnauthorized,
  onActiveProviderChange,
  onCatalogDefaultSelection
}: UseStudioCatalogOptions) {
  const [branding, setBranding] = useState<Branding>({ siteTitle: defaultSiteTitle, faviconUrl: "", logoUrl: "" });
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [userOpenaiKeyConfigured, setUserOpenaiKeyConfigured] = useState(false);
  const [providerSettingsLoaded, setProviderSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const brandLogoUrl = useMemo(
    () => logoLoadFailed ? "" : branding.logoUrl.trim(),
    [branding.logoUrl, logoLoadFailed]
  );

  function resetCatalogState() {
    setCatalog(null);
    resetProviderSettingsState();
  }

  function resetProviderSettingsState() {
    setSettingsMessage("");
    setProviderSettingsLoaded(false);
    setUserOpenaiKeyConfigured(false);
    setOpenaiKey("");
  }

  async function loadBranding() {
    try {
      const body = await fetchJson<Partial<Branding>>("/api/app/branding", { cache: "no-store" });
      setBranding({
        siteTitle: typeof body.siteTitle === "string" && body.siteTitle.trim() ? body.siteTitle.trim() : defaultSiteTitle,
        faviconUrl: typeof body.faviconUrl === "string" ? body.faviconUrl.trim() : "",
        logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() : ""
      });
    } catch {
      // Branding is optional and should not block the studio shell.
    }
  }

  async function loadCatalog() {
    try {
      const shouldApplyDefaultSelection = catalog === null;
      const body = await fetchJson<CatalogResponse>("/api/images/catalog", {
        cache: "no-store",
        fallbackMessage: messages.catalogLoadFailed
      });
      if (!Array.isArray(body.providers) || !Array.isArray(body.models)) {
        throw new Error(messages.catalogLoadFailed);
      }

      setCatalog(body);
      if (!shouldApplyDefaultSelection) return;

      const preferred = body.providers.find((item) => item.provider === provider && item.configured)
        ?? body.providers.find((item) => item.provider === "openai" && item.configured)
        ?? body.providers.find((item) => item.configured)
        ?? body.providers[0];
      if (!preferred) return;

      const preferredModel = body.models.find((item) => item.provider === preferred.provider);

      onCatalogDefaultSelection({
        provider: preferred.provider,
        modelId: preferredModel?.modelId,
        defaultAspectRatio: preferredModel?.defaultAspectRatio ?? "3:4",
        defaultResolution: preferred.supportsCustomSize ? defaultResolution : officialOpenAIResolution,
        defaultQuality: preferredModel?.defaultQuality ?? "medium",
        defaultInputFidelity: preferredModel?.inputFidelityOptions?.[0] ?? "high"
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    }
  }

  async function loadProviderSettings() {
    try {
      const body = await fetchJson<ProviderSettingsResponse>("/api/settings/provider", {
        cache: "no-store",
        fallbackMessage: messages.settingsLoadFailed
      });

      if (body.activeProvider) {
        onActiveProviderChange(body.activeProvider);
      }

      setOpenaiBaseUrl(body.baseUrls?.[provider] ?? body.baseUrls?.openai ?? "");
      setOpenaiModel(body.models?.[provider] ?? body.models?.openai ?? "");
      setUserOpenaiKeyConfigured(Boolean(body.keys?.[provider]?.configured && body.keys[provider].source === "user"));
      setProviderSettingsLoaded(true);
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    }
  }

  async function saveProviderSettings() {
    setSavingSettings(true);
    setSettingsMessage("");

    try {
      await fetchJson("/api/settings/provider", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          activeProvider: provider,
          keys: {
            [provider]: openaiKey
          },
          baseUrls: {
            [provider]: openaiBaseUrl
          },
          models: {
            [provider]: openaiModel
          }
        }),
        fallbackMessage: messages.settingsSaveFailed
      });

      setOpenaiKey("");
      setUserOpenaiKeyConfigured(Boolean(openaiKey.trim()) || userOpenaiKeyConfigured);
      setProviderSettingsLoaded(true);
      setSettingsMessage(messages.keySaved);
      await loadCatalog();
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setSettingsMessage(caught instanceof Error ? caught.message : messages.settingsSaveFailed);
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    void loadBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Branding is bootstrapped once; manual refresh uses loadBranding directly.
  }, []);

  useEffect(() => {
    document.title = branding.siteTitle || defaultSiteTitle;

    const managedId = "app-favicon";
    const existing = document.querySelector<HTMLLinkElement>(`link#${managedId}`);

    if (!branding.faviconUrl) {
      existing?.remove();
      return;
    }

    const link = existing ?? document.createElement("link");
    link.id = managedId;
    link.rel = "icon";
    link.href = branding.faviconUrl;

    if (!existing) {
      document.head.appendChild(link);
    }
  }, [branding, defaultSiteTitle]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [branding.logoUrl]);

  return {
    branding,
    brandLogoUrl,
    logoLoadFailed,
    setLogoLoadFailed,
    catalog,
    setCatalog,
    openaiKey,
    setOpenaiKey,
    openaiBaseUrl,
    setOpenaiBaseUrl,
    openaiModel,
    setOpenaiModel,
    userOpenaiKeyConfigured,
    providerSettingsLoaded,
    savingSettings,
    settingsMessage,
    setSettingsMessage,
    setProviderSettingsLoaded,
    setUserOpenaiKeyConfigured,
    resetCatalogState,
    resetProviderSettingsState,
    loadBranding,
    loadCatalog,
    loadProviderSettings,
    saveProviderSettings
  };
}
