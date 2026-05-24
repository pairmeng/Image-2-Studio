"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import type { CatalogResponse, ImageRecord } from "@/lib/types";
import type { ImageMode, ProviderId } from "@/lib/models";

type HistoryFilter = {
  provider: "all" | ProviderId;
  model: "all" | string;
};

type Locale = "en" | "zh";

type PendingGeneration = {
  provider: ProviderId;
  model: string;
  mode: ImageMode;
  prompt: string;
  size: string;
  aspectRatio: string;
  quality: string;
  sourceImageIds: string[];
  fileNames: string[];
  startedAt: number;
};

type PublicUser = {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  disabled: boolean;
};

type AdminOverview = {
  settings: {
    registrationOpen: boolean;
    dailyPlatformQuota: number;
  };
  users: PublicUser[];
  images: Array<{
    id: string;
    userEmail: string;
    provider: string;
    model: string;
    prompt: string;
    createdAt: string;
  }>;
  usage: Array<{
    id: string;
    userEmail: string;
    date: string;
    platformUses: number;
  }>;
};

const DEFAULT_MODE: ImageMode = "text-to-image";

const RESOLUTION_OPTIONS = [
  { value: "1024", label: "1K (1024px)" },
  { value: "2048", label: "2K (2048px)" },
  { value: "4096", label: "4K (4096px)" }
];

const DEFAULT_RESOLUTION = "4096";

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    settings: "Settings",
    apiProvider: "API provider",
    provider: "Provider",
    apiKeys: "API keys",
    openaiKey: "OpenAI API key",
    falKey: "fal API key",
    saveKeys: "Save settings",
    saving: "Saving",
    openaiCompatible: "OpenAI-compatible",
    baseUrl: "Base URL",
    modelId: "Model ID",
    baseUrlNote: "Leave Base URL empty to use OpenAI directly. Fill it for OpenAI-compatible third-party gateways.",
    falModelOverride: "fal model override",
    historyFilter: "History filter",
    allProviders: "All providers",
    allModels: "All models",
    create: "Create",
    promptStudio: "Prompt studio",
    textToImage: "Text to image",
    imageToImage: "Image to image",
    model: "Model",
    aspectRatio: "Aspect Ratio",
    resolution: "Resolution",
    quality: "Quality",
    fidelity: "Fidelity",
    prompt: "Prompt",
    promptPlaceholderText: "Describe the image you want to create...",
    promptPlaceholderImage: "Describe the change to make from the reference image...",
    clear: "Clear",
    quickStarts: "Quick starts",
    random: "Random",
    addReference: "Add reference",
    dragImages: "Drag images here for image-to-image",
    ready: "Ready",
    missingKey: "Missing API key",
    requestSent: "Request sent",
    generatingSmall: "image is being generated",
    falTextOnly: "fal text-only MVP",
    referencesEnabled: "references enabled when supported",
    generatingWith: "Generating with",
    generating: "Generating",
    generateImage: "Generate image",
    result: "Result",
    imageOutput: "Image output",
    providerReady: "Provider ready",
    generatingImage: "Generating image",
    keepOpen: "Please keep this page open",
    noImageYet: "No image yet",
    emptyResult: "Choose a provider, enter a prompt, and generate your first image.",
    editThisImage: "Edit this image",
    copyLink: "Copy link",
    copied: "Copied",
    download: "Download",
    open: "Open",
    preview: "Preview",
    generationDetails: "Generation details",
    promptUsed: "Prompt",
    copyPrompt: "Copy prompt",
    history: "History",
    images: "images",
    historyEmpty: "Generated images will appear here.",
    text: "Text",
    imageInput: "Image input",
    closePreview: "Close preview",
    imagePreview: "Image preview",
    language: "中文",
    languageTitle: "Switch to Chinese",
    configuredReplace: "Configured; enter a new key to replace",
    keySaved: "Saved. Provider settings were updated.",
    settingsLoadFailed: "Provider settings failed to load.",
    catalogLoadFailed: "Model catalog failed to load.",
    historyLoadFailed: "History failed to load.",
    chooseModelFirst: "Choose a model first.",
    providerNoKey: "This provider has no API key configured.",
    enterPrompt: "Enter a prompt.",
    imageNeedsReference: "Image-to-image needs an upload or a history image.",
    generationFailed: "Generation failed.",
    clearHistoryFailed: "History could not be cleared.",
    textReady: "Text ready",
    textOff: "Text off",
    imageReady: "Image ready",
    imageOff: "Image off",
    continueReady: "Continue ready",
    continueOff: "Continue off",
    editingFrom: "Editing from"
  },
  zh: {
    settings: "设置",
    apiProvider: "API 供应商",
    provider: "供应商",
    apiKeys: "API 密钥",
    openaiKey: "OpenAI API 密钥",
    falKey: "fal API 密钥",
    saveKeys: "保存全部设置",
    saving: "保存中",
    openaiCompatible: "OpenAI 兼容接口",
    baseUrl: "Base URL",
    modelId: "模型 ID",
    baseUrlNote: "留空表示直连 OpenAI；填写后可使用 OpenAI 兼容的第三方网关。",
    falModelOverride: "fal 模型覆盖",
    historyFilter: "历史筛选",
    allProviders: "全部供应商",
    allModels: "全部模型",
    create: "创作",
    promptStudio: "提示词工作台",
    textToImage: "文生图",
    imageToImage: "图生图",
    model: "模型",
    aspectRatio: "宽高比",
    resolution: "分辨率",
    quality: "质量",
    fidelity: "保真度",
    prompt: "提示词",
    promptPlaceholderText: "描述你想生成的图片...",
    promptPlaceholderImage: "描述你想基于参考图做出的修改...",
    clear: "清空",
    quickStarts: "快速示例",
    random: "随机",
    addReference: "添加参考图",
    dragImages: "拖拽图片到这里用于图生图",
    ready: "就绪",
    missingKey: "缺少 API 密钥",
    requestSent: "请求已发送",
    generatingSmall: "正在生成图片",
    falTextOnly: "fal 首版仅文生图",
    referencesEnabled: "模型支持时可使用参考图",
    generatingWith: "正在使用",
    generating: "生成中",
    generateImage: "生成图片",
    result: "结果",
    imageOutput: "图片输出",
    providerReady: "供应商已就绪",
    generatingImage: "正在生成图片",
    keepOpen: "请保持页面打开",
    noImageYet: "还没有图片",
    emptyResult: "选择供应商，输入提示词，然后生成第一张图片。",
    editThisImage: "编辑此图",
    copyLink: "复制链接",
    copied: "已复制",
    download: "下载",
    open: "打开",
    preview: "预览",
    generationDetails: "生成详情",
    promptUsed: "提示词",
    copyPrompt: "复制提示词",
    history: "历史",
    images: "张图片",
    historyEmpty: "生成后的图片会显示在这里。",
    text: "文本",
    imageInput: "图片输入",
    closePreview: "关闭预览",
    imagePreview: "图片预览",
    language: "EN",
    languageTitle: "切换到英文",
    configuredReplace: "已配置；输入新密钥可替换",
    keySaved: "已保存，供应商设置已更新。",
    settingsLoadFailed: "供应商设置加载失败。",
    catalogLoadFailed: "模型目录加载失败。",
    historyLoadFailed: "历史记录加载失败。",
    chooseModelFirst: "请先选择模型。",
    providerNoKey: "当前供应商尚未配置 API 密钥。",
    enterPrompt: "请输入提示词。",
    imageNeedsReference: "图生图需要上传参考图或选择历史图片。",
    generationFailed: "生成失败。",
    clearHistoryFailed: "历史记录清空失败。",
    textReady: "支持文生图",
    textOff: "不支持文生图",
    imageReady: "支持图生图",
    imageOff: "不支持图生图",
    continueReady: "支持继续编辑",
    continueOff: "不支持继续编辑",
    editingFrom: "正在编辑来源"
  }
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getProviderLabel(catalog: CatalogResponse | null, provider: ProviderId) {
  return catalog?.providers.find((item) => item.provider === provider)?.label ?? provider;
}

function getModelLabel(catalog: CatalogResponse | null, provider: ProviderId, modelId: string) {
  return catalog?.models.find((item) => item.provider === provider && item.modelId === modelId)?.label ?? modelId;
}

function modelSupports(model: { capabilities: string[] } | undefined, capability: string) {
  return Boolean(model?.capabilities.includes(capability));
}

function getAspectRatioLabel(value: string) {
  if (value === "auto") return "Auto";
  return value;
}

function getResolutionLabel(value: string) {
  return RESOLUTION_OPTIONS.find((item) => item.value === value)?.label ?? `${value}px`;
}

function getProviderSizeFromAspectRatio(provider: ProviderId, aspectRatio: string) {
  if (provider === "openai") {
    if (aspectRatio === "auto" || aspectRatio === "1:1") return "1024x1024";

    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    if (!rawWidth || !rawHeight) return "1024x1024";
    return rawWidth > rawHeight ? "1536x1024" : "1024x1536";
  }

  return undefined;
}

export default function Home() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("gpt-image-2");
  const [mode, setMode] = useState<ImageMode>(DEFAULT_MODE);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [quality, setQuality] = useState("medium");
  const [inputFidelity, setInputFidelity] = useState("high");
  const [files, setFiles] = useState<File[]>([]);
  const [sourceImageIds, setSourceImageIds] = useState<string[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({ provider: "all", model: "all" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [quickMenu, setQuickMenu] = useState<"model" | "aspect" | "resolution" | "quality" | "fidelity" | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [falKey, setFalKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [falModel, setFalModel] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [referenceDragging, setReferenceDragging] = useState(false);
  const [lightboxRecordId, setLightboxRecordId] = useState("");
  const [locale, setLocale] = useState<Locale>("zh");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copiedPromptId, setCopiedPromptId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [platformOpenaiKey, setPlatformOpenaiKey] = useState("");
  const [platformFalKey, setPlatformFalKey] = useState("");
  const [platformOpenaiBaseUrl, setPlatformOpenaiBaseUrl] = useState("");
  const [platformOpenaiModel, setPlatformOpenaiModel] = useState("");
  const [platformFalModel, setPlatformFalModel] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const providerStatus = useMemo(
    () => catalog?.providers.find((item) => item.provider === provider),
    [catalog, provider]
  );

  const providerModels = useMemo(
    () => catalog?.models.filter((item) => item.provider === provider) ?? [],
    [catalog, provider]
  );

  const selectedModel = useMemo(
    () => providerModels.find((item) => item.modelId === model),
    [model, providerModels]
  );

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (historyFilter.provider !== "all" && record.provider !== historyFilter.provider) return false;
      if (historyFilter.model !== "all" && record.model !== historyFilter.model) return false;
      return true;
    });
  }, [historyFilter, records]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.id === selectedRecordId) ?? filteredRecords[0],
    [filteredRecords, selectedRecordId]
  );

  const lightboxRecord = useMemo(
    () => records.find((record) => record.id === lightboxRecordId),
    [lightboxRecordId, records]
  );

  const selectedRecordModel = useMemo(
    () => selectedRecord
      ? catalog?.models.find((item) => item.provider === selectedRecord.provider && item.modelId === selectedRecord.model)
      : undefined,
    [catalog, selectedRecord]
  );

  const selectedRecordCanContinue = Boolean(
    selectedRecord
    && catalog?.providers.find((item) => item.provider === selectedRecord.provider)?.configured
    && modelSupports(selectedRecordModel, "continue-edit")
  );

  const activeSourceRecords = useMemo(
    () => sourceImageIds
      .map((id) => records.find((record) => record.id === id))
      .filter((record): record is ImageRecord => Boolean(record)),
    [records, sourceImageIds]
  );

  const canUseImageMode = modelSupports(selectedModel, "image-to-image");
  const canContinueEdit = modelSupports(selectedModel, "continue-edit");
  const isConfigured = Boolean(providerStatus?.configured);
  const t = (key: string) => COPY[locale][key] ?? COPY.en[key] ?? key;
  const aspectRatioOptions = selectedModel?.supportedAspectRatios ?? ["auto", "1:1", "3:4", "4:3", "9:16", "16:9"];

  function resetAuthenticatedState(message?: string) {
    setCurrentUser(null);
    setRecords([]);
    setCatalog(null);
    setSelectedRecordId("");
    setSourceImageIds([]);
    setFiles([]);
    setSettingsOpen(false);
    setAdminOpen(false);
    setAdminOverview(null);
    setPendingGeneration(null);
    setLoading(false);
    setError("");
    setSettingsMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (message) {
      setAuthError(message);
    }
  }

  function handleUnauthorized(response: Response) {
    if (response.status !== 401) return false;

    resetAuthenticatedState(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
    return true;
  }

  async function loadSession() {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const body = (await response.json()) as { user: PublicUser | null; registrationOpen: boolean };
      setCurrentUser(body.user);
      setRegistrationOpen(body.registrationOpen);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: authEmail, password: authPassword })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; user?: PublicUser };

    if (!response.ok || !body.user) {
      setAuthError(body.error ?? "Authentication failed.");
      return;
    }

    setCurrentUser(body.user);
    setAuthPassword("");
    await Promise.all([loadCatalog(), loadHistory(), loadProviderSettings()]);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    resetAuthenticatedState();
  }

  async function loadAdminOverview() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    if (handleUnauthorized(response)) return;
    if (!response.ok) throw new Error("Admin overview could not be loaded.");

    const body = (await response.json()) as AdminOverview;
    setAdminOverview(body);
  }

  async function saveAdminSettings(next?: Partial<AdminOverview["settings"]>) {
    if (!adminOverview) return;
    setAdminMessage("");
    const settings = { ...adminOverview.settings, ...next };
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings)
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      setAdminMessage("Admin settings could not be saved.");
      return;
    }

    setAdminMessage("Admin settings saved.");
    await loadAdminOverview();
  }

  async function createAdminUser() {
    setAdminMessage("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: newUserEmail, password: newUserPassword, role: "USER" })
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setAdminMessage(body.error ?? "User could not be created.");
      return;
    }

    setNewUserEmail("");
    setNewUserPassword("");
    setAdminMessage("User created.");
    await loadAdminOverview();
  }

  async function toggleUserDisabled(user: PublicUser) {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disabled: !user.disabled })
    });
    if (handleUnauthorized(response)) return;
    if (!response.ok) {
      setAdminMessage("User could not be updated.");
      return;
    }
    await loadAdminOverview();
  }

  async function savePlatformProvider() {
    setAdminMessage("");
    const response = await fetch("/api/admin/provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keys: {
          openai: platformOpenaiKey,
          fal: platformFalKey
        },
        baseUrls: {
          openai: platformOpenaiBaseUrl
        },
        models: {
          openai: platformOpenaiModel,
          fal: platformFalModel
        }
      })
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      setAdminMessage("Platform provider settings could not be saved.");
      return;
    }

    setPlatformOpenaiKey("");
    setPlatformFalKey("");
    setAdminMessage("Platform provider saved.");
    await loadCatalog();
  }

  async function loadCatalog() {
    const response = await fetch("/api/images/catalog", { cache: "no-store" });
    if (handleUnauthorized(response)) return;
    if (!response.ok) throw new Error(t("catalogLoadFailed"));

    const body = (await response.json()) as CatalogResponse;
    if (!Array.isArray(body.providers) || !Array.isArray(body.models)) {
      throw new Error(t("catalogLoadFailed"));
    }

    setCatalog(body);

    const preferred = body.providers.find((item) => item.provider === "openai" && item.configured)
      ?? body.providers.find((item) => item.configured)
      ?? body.providers[0];
    if (!preferred) return;

    const preferredModel = body.models.find((item) => item.provider === preferred.provider);

    setProvider(preferred.provider);
    if (preferredModel) {
      setModel(preferredModel.modelId);
      setSize(preferredModel.defaultSize ?? "1024x1024");
      setAspectRatio(preferredModel.defaultAspectRatio ?? "3:4");
      setResolution(DEFAULT_RESOLUTION);
      setQuality(preferredModel.defaultQuality ?? "medium");
      setInputFidelity(preferredModel.inputFidelityOptions?.[0] ?? "high");
    }
  }

  async function loadHistory() {
    const response = await fetch("/api/images/history", { cache: "no-store" });
    if (handleUnauthorized(response)) return;
    if (!response.ok) throw new Error(t("historyLoadFailed"));

    const body = (await response.json()) as { records: ImageRecord[] };
    const nextRecords = Array.isArray(body.records) ? body.records : [];
    setRecords(nextRecords);
    setSelectedRecordId((current) => current || nextRecords[0]?.id || "");
  }

  useEffect(() => {
    void loadSession().catch(() => {
      setAuthLoading(false);
      setAuthError("Session could not be loaded.");
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    void loadCatalog().catch(() => setError(t("catalogLoadFailed")));
    void loadHistory().catch(() => setError(t("historyLoadFailed")));
    void loadProviderSettings().catch(() => setSettingsMessage(t("settingsLoadFailed")));
  }, [currentUser, locale]);

  useEffect(() => {
    if (!adminOpen || currentUser?.role !== "ADMIN") return;
    void loadAdminOverview().catch(() => setAdminMessage("Admin overview could not be loaded."));
  }, [adminOpen, currentUser]);

  useEffect(() => {
    if (providerModels.length === 0) return;

    const nextModel = providerModels.find((item) => item.modelId === model) ?? providerModels[0];
    if (!nextModel) return;

    if (nextModel.modelId !== model) {
      setModel(nextModel.modelId);
    }

    setSize(nextModel.defaultSize ?? "1024x1024");
    setAspectRatio(nextModel.defaultAspectRatio ?? "3:4");
    setResolution(DEFAULT_RESOLUTION);
    setQuality(nextModel.defaultQuality ?? "medium");
    setInputFidelity(nextModel.inputFidelityOptions?.[0] ?? "high");

    if (!modelSupports(nextModel, "image-to-image")) {
      setMode("text-to-image");
      setSourceImageIds([]);
    }
  }, [model, providerModels]);

  useEffect(() => {
    if (!pendingGeneration) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - pendingGeneration.startedAt) / 1000)));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingGeneration]);

  function updateProvider(nextProvider: ProviderId) {
    setProvider(nextProvider);
    setError("");
    setQuickMenu(null);
  }

  function chooseModel(nextModel: string) {
    setModel(nextModel);
    setQuickMenu(null);
  }

  function chooseAspectRatio(nextAspectRatio: string) {
    setAspectRatio(nextAspectRatio);
    setSize(getProviderSizeFromAspectRatio(provider, nextAspectRatio) ?? "");
    setQuickMenu(null);
  }

  function chooseResolution(nextResolution: string) {
    setResolution(nextResolution);
    setQuickMenu(null);
  }

  function chooseQuality(nextQuality: string) {
    setQuality(nextQuality);
    setQuickMenu(null);
  }

  function chooseInputFidelity(nextInputFidelity: string) {
    setInputFidelity(nextInputFidelity);
    setQuickMenu(null);
  }

  async function loadProviderSettings() {
    const response = await fetch("/api/settings/provider", { cache: "no-store" });
    if (handleUnauthorized(response)) return;
    if (!response.ok) throw new Error(t("settingsLoadFailed"));

    const body = (await response.json()) as {
      activeProvider?: ProviderId;
      keys: Record<ProviderId, { configured: boolean; source: "local" | "env" | "none" }>;
      baseUrls: Partial<Record<ProviderId, string>>;
      models: Partial<Record<ProviderId, string>>;
    };

    if (body.activeProvider) {
      setProvider(body.activeProvider);
    }

    setOpenaiBaseUrl(body.baseUrls?.openai ?? "");
    setOpenaiModel(body.models?.openai ?? "");
    setFalModel(body.models?.fal ?? "");
  }

  async function saveProviderSettings() {
    setSavingSettings(true);
    setSettingsMessage("");

    try {
      const response = await fetch("/api/settings/provider", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          activeProvider: provider,
          keys: {
            openai: openaiKey,
            fal: falKey
          },
          baseUrls: {
            openai: openaiBaseUrl
          },
          models: {
            openai: openaiModel,
            fal: falModel
          }
        })
      });

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        throw new Error(locale === "zh" ? "设置保存失败。" : "Settings could not be saved.");
      }

      setOpenaiKey("");
      setFalKey("");
      setSettingsMessage(t("keySaved"));
      await loadCatalog();
    } catch (caught) {
      setSettingsMessage(caught instanceof Error ? caught.message : (locale === "zh" ? "设置保存失败。" : "Settings could not be saved."));
    } finally {
      setSavingSettings(false);
    }
  }

  function updateMode(nextMode: ImageMode) {
    if (nextMode === "image-to-image" && !canUseImageMode) {
      setError(t("imageOff"));
      return;
    }

    setMode(nextMode);
    setError("");
  }

  function updateFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    const combined = [...files, ...Array.from(nextFiles)].slice(0, 4);
    setFiles(combined);

    if (combined.length > 0 && canUseImageMode) {
      setMode("image-to-image");
    }
  }

  function handleReferenceDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (loading || !canUseImageMode) return;
    setReferenceDragging(true);
  }

  function handleReferenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setReferenceDragging(false);

    if (loading || !canUseImageMode) return;
    updateFiles(event.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function startContinueEdit(record: ImageRecord) {
    setProvider(record.provider);
    setModel(record.model);
    setMode("image-to-image");
    setSourceImageIds([record.id]);
    setPrompt("");
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function clearSource(id: string) {
    setSourceImageIds((current) => current.filter((item) => item !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedModel) {
      setError(t("chooseModelFirst"));
      setSettingsOpen(true);
      return;
    }

    if (!isConfigured) {
      setError(t("providerNoKey"));
      setSettingsOpen(true);
      return;
    }

    if (!prompt.trim()) {
      setError(t("enterPrompt"));
      return;
    }

    if (mode === "image-to-image" && files.length + sourceImageIds.length === 0) {
      setError(t("imageNeedsReference"));
      return;
    }

    const providerSize = getProviderSizeFromAspectRatio(provider, aspectRatio) ?? size;
    const formData = new FormData();
    formData.set("provider", provider);
    formData.set("model", model);
    formData.set("mode", mode);
    formData.set("prompt", prompt.trim());
    formData.set("size", providerSize);
    formData.set("aspectRatio", aspectRatio);
    formData.set("resolution", resolution);
    formData.set("quality", quality);
    formData.set("inputFidelity", inputFidelity);
    sourceImageIds.forEach((id) => formData.append("sourceImageIds", id));
    files.forEach((file) => formData.append("files", file));

    setPendingGeneration({
      provider,
      model,
      mode,
      prompt: prompt.trim(),
      size: providerSize,
      aspectRatio,
      quality,
      sourceImageIds: [...sourceImageIds],
      fileNames: files.map((file) => file.name),
      startedAt: Date.now()
    });
    setLoading(true);

    try {
      const response = await fetch("/api/images/create", {
        method: "POST",
        body: formData
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        if (response.status === 504) {
          throw new Error(body.error || (locale === "zh"
            ? "上游生图网关超时，没有返回图片。请稍后重试，或切换更快的供应商/模型、降低复杂度。"
            : "The upstream image gateway timed out before returning an image. Try again later, switch to a faster provider/model, or reduce prompt complexity."));
        }

        throw new Error(body.error || t("generationFailed"));
      }

      setPrompt("");
      setFiles([]);
      setSourceImageIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadHistory();
      if ("id" in body && typeof body.id === "string") {
        setSelectedRecordId(body.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
    } finally {
      setLoading(false);
      setPendingGeneration(null);
    }
  }

  async function copyImage(record: ImageRecord) {
    const url = new URL(record.imageUrl, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopiedId(record.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function copyPromptText(record: ImageRecord) {
    await navigator.clipboard.writeText(record.prompt);
    setCopiedPromptId(record.id);
    window.setTimeout(() => setCopiedPromptId(""), 1400);
  }

  async function clearHistory() {
    setError("");
    const response = await fetch("/api/images/history/clear", { method: "POST" });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      setError(t("clearHistoryFailed"));
      return;
    }

    setRecords([]);
    setSourceImageIds([]);
    setSelectedRecordId("");
  }

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <Loader2 className="spin" size={24} />
          <h1>Image-2 Studio</h1>
          <p>正在加载账户状态...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-shell">
        <form className="auth-card" onSubmit={(event) => void submitAuth(event)}>
          <div className="brand center-brand">
            <div className="brand-mark">
              <Wand2 size={21} />
            </div>
            <div>
              <p className="brand-title">Image-2 Studio</p>
              <p className="brand-subtitle">Multi-user image workspace</p>
            </div>
          </div>
          <h1>{authMode === "login" ? "登录" : "注册"}</h1>
          <label className="key-field">
            <span>邮箱</span>
            <input className="field" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label className="key-field">
            <span>密码</span>
            <input className="field" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} />
          </label>
          {authError && <div className="alert">{authError}</div>}
          <button className="primary-button" type="submit">
            {authMode === "login" ? "登录" : "创建账号"}
          </button>
          <div className="auth-switch">
            <button className="text-button tiny" type="button" onClick={() => setAuthMode("login")}>登录</button>
            <button className="text-button tiny" type="button" disabled={!registrationOpen} onClick={() => setAuthMode("register")}>注册</button>
          </div>
          {!registrationOpen && <p className="settings-note">注册已关闭，请联系管理员创建账号。</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="studio-shell">
      {(settingsOpen || adminOpen) && <button className="drawer-scrim" aria-label={t("closePreview")} type="button" onClick={() => { setSettingsOpen(false); setAdminOpen(false); }} />}

      <aside className={`settings-drawer ${settingsOpen ? "is-open" : ""}`} aria-hidden={!settingsOpen}>
        <div className="drawer-head">
          <div>
            <p className="section-label">{t("settings")}</p>
            <h2>{t("apiProvider")}</h2>
          </div>
          <button className="icon-button" type="button" title={t("closePreview")} onClick={() => setSettingsOpen(false)}>
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
                onClick={() => updateProvider(item.provider)}
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
              <span>{t("openaiKey")}</span>
              <input
                className="field"
                value={openaiKey}
                onChange={(event) => setOpenaiKey(event.target.value)}
                placeholder={catalog?.providers.find((item) => item.provider === "openai")?.configured ? t("configuredReplace") : "sk-..."}
                type="password"
                autoComplete="off"
              />
            </label>
            <label className="key-field">
              <span>{t("falKey")}</span>
              <input
                className="field"
                value={falKey}
                onChange={(event) => setFalKey(event.target.value)}
                placeholder={catalog?.providers.find((item) => item.provider === "fal")?.configured ? t("configuredReplace") : "fal key"}
                type="password"
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <section className="drawer-section">
          <p className="section-label">{t("openaiCompatible")}</p>
          <div className="filter-stack">
            <label className="key-field">
              <span>{t("baseUrl")}</span>
              <input
                className="field"
                value={openaiBaseUrl}
                onChange={(event) => setOpenaiBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                type="url"
              />
            </label>
            <label className="key-field">
              <span>{t("modelId")}</span>
              <input
                className="field"
                value={openaiModel}
                onChange={(event) => setOpenaiModel(event.target.value)}
                placeholder="gpt-image-2 or provider image model"
                type="text"
              />
            </label>
            <p className="settings-note">
              {t("baseUrlNote")}
            </p>
          </div>
        </section>

        <section className="drawer-section">
          <p className="section-label">{t("falModelOverride")}</p>
          <label className="key-field">
            <span>{t("modelId")}</span>
            <input
              className="field"
              value={falModel}
              onChange={(event) => setFalModel(event.target.value)}
              placeholder="fal-ai/flux/dev"
              type="text"
            />
          </label>
        </section>

        <section className="drawer-section drawer-save-section">
          <button className="primary-button drawer-save" type="button" disabled={savingSettings} onClick={() => void saveProviderSettings()}>
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
              onChange={(event) => setHistoryFilter((current) => ({ ...current, provider: event.target.value as HistoryFilter["provider"] }))}
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
              onChange={(event) => setHistoryFilter((current) => ({ ...current, model: event.target.value }))}
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

      <aside className={`settings-drawer admin-drawer ${adminOpen ? "is-open" : ""}`} aria-hidden={!adminOpen}>
        <div className="drawer-head">
          <div>
            <p className="section-label">Admin</p>
            <h2>管理后台</h2>
          </div>
          <button className="icon-button" type="button" title={t("closePreview")} onClick={() => setAdminOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {adminOverview ? (
          <>
            <section className="drawer-section">
              <p className="section-label">站点设置</p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={adminOverview.settings.registrationOpen}
                  onChange={(event) => void saveAdminSettings({ registrationOpen: event.target.checked })}
                />
                <span>允许个人自行注册</span>
              </label>
              <label className="key-field">
                <span>平台 key 每日额度</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={adminOverview.settings.dailyPlatformQuota}
                  onChange={(event) => setAdminOverview((current) => current ? {
                    ...current,
                    settings: { ...current.settings, dailyPlatformQuota: Number(event.target.value) }
                  } : current)}
                />
              </label>
              <button className="text-button" type="button" onClick={() => void saveAdminSettings()}>
                <Check size={16} />
                保存额度
              </button>
            </section>

            <section className="drawer-section">
              <p className="section-label">平台供应商</p>
              <div className="filter-stack">
                <input className="field" type="password" placeholder="OpenAI platform key" value={platformOpenaiKey} onChange={(event) => setPlatformOpenaiKey(event.target.value)} />
                <input className="field" placeholder="OpenAI Base URL" value={platformOpenaiBaseUrl} onChange={(event) => setPlatformOpenaiBaseUrl(event.target.value)} />
                <input className="field" placeholder="OpenAI model override" value={platformOpenaiModel} onChange={(event) => setPlatformOpenaiModel(event.target.value)} />
                <input className="field" type="password" placeholder="fal platform key" value={platformFalKey} onChange={(event) => setPlatformFalKey(event.target.value)} />
                <input className="field" placeholder="fal model override" value={platformFalModel} onChange={(event) => setPlatformFalModel(event.target.value)} />
                <button className="primary-button drawer-save" type="button" onClick={() => void savePlatformProvider()}>
                  <Check size={17} />
                  保存平台配置
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">创建用户</p>
              <div className="filter-stack">
                <input className="field" type="email" placeholder="user@example.com" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} />
                <input className="field" type="password" placeholder="至少 8 位密码" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} />
                <button className="text-button" type="button" onClick={() => void createAdminUser()}>
                  <Check size={16} />
                  创建用户
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">用户</p>
              <div className="admin-list">
                {adminOverview.users.map((user) => (
                  <div className="admin-row" key={user.id}>
                    <div>
                      <strong>{user.email}</strong>
                      <span>{user.role}{user.disabled ? " / disabled" : ""}</span>
                    </div>
                    <button className="text-button tiny" type="button" onClick={() => void toggleUserDisabled(user)}>
                      {user.disabled ? "启用" : "禁用"}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">用量</p>
              <div className="admin-list">
                {adminOverview.usage.slice(0, 12).map((item) => (
                  <div className="admin-row" key={item.id}>
                    <div>
                      <strong>{item.userEmail}</strong>
                      <span>{item.date}</span>
                    </div>
                    <span>{item.platformUses}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">最近历史</p>
              <div className="admin-list">
                {adminOverview.images.slice(0, 12).map((item) => (
                  <div className="admin-row" key={item.id}>
                    <div>
                      <strong>{item.userEmail}</strong>
                      <span>{item.provider} / {item.model}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="composer-status">
            <Loader2 className="spin" size={17} />
            <span>加载管理数据...</span>
          </div>
        )}
        {adminMessage && <p className="settings-message">{adminMessage}</p>}
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand compact">
            <div className="brand-mark">
              <Wand2 size={21} />
            </div>
            <div>
              <p className="brand-title">Image-2 Studio</p>
              <p className="brand-subtitle">
                {getProviderLabel(catalog, provider)} / {selectedModel?.label ?? model}
              </p>
            </div>
          </div>
          <div className="toolbar">
            <span className="user-pill">{currentUser.email}</span>
            {currentUser.role === "ADMIN" && (
              <button className="text-button" type="button" onClick={() => setAdminOpen(true)}>
                Admin
              </button>
            )}
            <button className="text-button locale-button" type="button" title={t("languageTitle")} onClick={() => setLocale((current) => current === "zh" ? "en" : "zh")}>
              {t("language")}
            </button>
            <button className="icon-button" type="button" title={t("history")} onClick={() => void loadHistory()}>
              <RefreshCw size={17} />
            </button>
            <button className="icon-button" type="button" title={t("settings")} onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} />
            </button>
            <button className="icon-button danger-button" type="button" title={t("clearHistoryFailed")} onClick={() => void clearHistory()}>
              <Trash2 size={16} />
            </button>
            <button className="text-button" type="button" onClick={() => void logout()}>
              退出
            </button>
          </div>
        </header>

        <section className="workspace">
          <form className={`control-panel ${loading ? "is-busy" : ""}`} onSubmit={(event) => void submit(event)} aria-busy={loading}>
            <div className="panel-heading">
              <div>
                <p className="section-label">{t("create")}</p>
                <h1>{t("promptStudio")}</h1>
              </div>
              <button className="icon-button" type="button" title={t("settings")} onClick={() => setSettingsOpen(true)}>
                <Settings2 size={18} />
              </button>
            </div>

            <div className="mode-toggle full-width" aria-label={locale === "zh" ? "生成模式" : "Generation mode"}>
              <button
                className={mode === "text-to-image" ? "is-active" : ""}
                type="button"
                disabled={loading}
                onClick={() => updateMode("text-to-image")}
              >
                {t("textToImage")}
              </button>
              <button
                className={mode === "image-to-image" ? "is-active" : ""}
                type="button"
                disabled={loading || !canUseImageMode}
                onClick={() => updateMode("image-to-image")}
              >
                {t("imageToImage")}
              </button>
            </div>

            <div className="quick-bar">
              <div className="quick-control">
                <button
                  className={`quick-chip ${quickMenu === "model" ? "is-open" : ""}`}
                  type="button"
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "model" ? null : "model")}
                >
                  <span>{t("model")}</span>
                  <strong>{selectedModel?.label ?? model}</strong>
                  <ChevronDown size={15} />
                </button>
                {quickMenu === "model" && (
                  <div className="quick-menu">
                    {providerModels.map((item) => (
                      <button
                        className={item.modelId === model ? "is-selected" : ""}
                        key={item.modelId}
                        type="button"
                        onClick={() => chooseModel(item.modelId)}
                      >
                        <span>{item.label}</span>
                        {item.modelId === model && <Check size={15} />}
                      </button>
                    ))}
                    <div className="quick-capabilities">
                      <span>{modelSupports(selectedModel, "text-to-image") ? t("textReady") : t("textOff")}</span>
                      <span>{canUseImageMode ? t("imageReady") : t("imageOff")}</span>
                      <span>{canContinueEdit ? t("continueReady") : t("continueOff")}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="quick-control spec-control">
                <button
                  className={`spec-select ${quickMenu === "aspect" ? "is-open" : ""}`}
                  type="button"
                  aria-label={t("aspectRatio")}
                  title={t("aspectRatio")}
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "aspect" ? null : "aspect")}
                >
                  <strong>{getAspectRatioLabel(aspectRatio)}</strong>
                  <ChevronDown size={16} />
                </button>
                {quickMenu === "aspect" && (
                  <div className="quick-menu spec-menu">
                    {aspectRatioOptions.map((item) => (
                      <button
                        className={item === aspectRatio ? "is-selected" : ""}
                        key={item}
                        type="button"
                        onClick={() => chooseAspectRatio(item)}
                      >
                        <span>{getAspectRatioLabel(item)}</span>
                        {item === aspectRatio && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="quick-control spec-control">
                <button
                  className={`spec-select ${quickMenu === "resolution" ? "is-open" : ""}`}
                  type="button"
                  aria-label={t("resolution")}
                  title={t("resolution")}
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "resolution" ? null : "resolution")}
                >
                  <strong>{getResolutionLabel(resolution)}</strong>
                  <ChevronDown size={16} />
                </button>
                {quickMenu === "resolution" && (
                  <div className="quick-menu spec-menu">
                    {RESOLUTION_OPTIONS.map((item) => (
                      <button
                        className={item.value === resolution ? "is-selected" : ""}
                        key={item.value}
                        type="button"
                        onClick={() => chooseResolution(item.value)}
                      >
                        <span>{item.label}</span>
                        {item.value === resolution && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedModel?.qualityOptions && selectedModel.qualityOptions.length > 1 && (
                <div className="quick-control">
                  <button
                    className={`quick-chip ${quickMenu === "quality" ? "is-open" : ""}`}
                    type="button"
                    disabled={loading}
                    onClick={() => setQuickMenu((current) => current === "quality" ? null : "quality")}
                  >
                    <span>{t("quality")}</span>
                    <strong>{quality}</strong>
                    <ChevronDown size={15} />
                  </button>
                  {quickMenu === "quality" && (
                    <div className="quick-menu">
                      {selectedModel.qualityOptions.map((item) => (
                        <button
                          className={item === quality ? "is-selected" : ""}
                          key={item}
                          type="button"
                          onClick={() => chooseQuality(item)}
                        >
                          <span>{item}</span>
                          {item === quality && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {mode === "image-to-image" && selectedModel?.inputFidelityOptions && (
                <div className="quick-control">
                  <button
                    className={`quick-chip ${quickMenu === "fidelity" ? "is-open" : ""}`}
                    type="button"
                    disabled={loading}
                    onClick={() => setQuickMenu((current) => current === "fidelity" ? null : "fidelity")}
                  >
                    <span>{t("fidelity")}</span>
                    <strong>{inputFidelity}</strong>
                    <ChevronDown size={15} />
                  </button>
                  {quickMenu === "fidelity" && (
                    <div className="quick-menu">
                      {selectedModel.inputFidelityOptions.map((item) => (
                        <button
                          className={item === inputFidelity ? "is-selected" : ""}
                          key={item}
                          type="button"
                          onClick={() => chooseInputFidelity(item)}
                        >
                          <span>{item}</span>
                          {item === inputFidelity && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <label className="prompt-field">
              <span>{t("prompt")}</span>
              <textarea
                className="textarea"
                ref={promptRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={mode === "text-to-image" ? t("promptPlaceholderText") : t("promptPlaceholderImage")}
                disabled={loading}
              />
            </label>
            <div className="prompt-tools">
              <button className="text-button tiny" type="button" disabled={loading || !prompt} onClick={() => setPrompt("")}>
                {t("clear")}
              </button>
              <span>{prompt.length}/2000</span>
            </div>

            {activeSourceRecords.length > 0 && (
              <div className="active-source">
                <span>{t("editingFrom")} {activeSourceRecords.map((record) => getModelLabel(catalog, record.provider, record.model)).join(", ")}</span>
                {activeSourceRecords.map((record) => (
                  <button className="icon-button" key={record.id} type="button" title={locale === "zh" ? "移除来源" : "Remove source"} onClick={() => clearSource(record.id)}>
                    <X size={16} />
                  </button>
                ))}
              </div>
            )}

            <div className="composer-actions">
              <div
                className={`drop-zone ${referenceDragging ? "is-dragging" : ""} ${loading || !canUseImageMode ? "is-disabled" : ""}`}
                onDragEnter={handleReferenceDrag}
                onDragOver={handleReferenceDrag}
                onDragLeave={() => setReferenceDragging(false)}
                onDrop={handleReferenceDrop}
              >
                <label className="upload-chip">
                  <Upload size={17} />
                  <span>{files.length > 0 ? `${files.length} ${locale === "zh" ? "张参考图" : `reference${files.length > 1 ? "s" : ""}`}` : t("addReference")}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => updateFiles(event.target.files)}
                    disabled={loading || !canUseImageMode}
                  />
                </label>
                <p>{t("dragImages")}</p>
              </div>

              <p className="hint">
                {loading ? t("requestSent") : isConfigured ? t("ready") : t("missingKey")}
                {" / "}
                {loading ? t("generatingSmall") : provider === "fal" ? t("falTextOnly") : t("referencesEnabled")}
              </p>
            </div>

            {files.length > 0 && (
              <div className="draft-files">
                {files.map((file, index) => (
                  <span className="draft-file" key={`${file.name}:${file.lastModified}`}>
                    <span>{file.name}</span>
                    <button className="icon-button" type="button" title={locale === "zh" ? "移除文件" : "Remove file"} onClick={() => removeFile(index)}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {loading && pendingGeneration && (
              <div className="composer-status" role="status">
                <Loader2 className="spin" size={17} />
                <span>{t("generatingWith")} {getProviderLabel(catalog, pendingGeneration.provider)}</span>
                <strong>{elapsedSeconds}s</strong>
              </div>
            )}

            {error && <div className="alert">{error}</div>}

            <button className="primary-button generate-button" type="submit" disabled={loading || !isConfigured}>
              {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {loading ? t("generating") : t("generateImage")}
            </button>
          </form>

          <section className="result-panel">
            <div className="panel-heading">
              <div>
                <p className="section-label">{t("result")}</p>
                <h2>{t("imageOutput")}</h2>
              </div>
              <span className={`status-pill ${isConfigured ? "is-ready" : ""}`}>
                {isConfigured ? t("providerReady") : t("missingKey")}
              </span>
            </div>

            {pendingGeneration ? (
              <div className="result-stage is-pending" aria-live="polite" aria-busy="true">
                <div className="result-meta">
                  <span className="tag is-provider">{getProviderLabel(catalog, pendingGeneration.provider)}</span>
                  <span className="tag">{getModelLabel(catalog, pendingGeneration.provider, pendingGeneration.model)}</span>
                  <span className="tag is-live">{t("generating")} {elapsedSeconds}s</span>
                </div>
                <div className="generation-preview large">
                  <div className="generation-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="generation-center">
                    <Loader2 className="spin" size={26} />
                    <strong>{t("generatingImage")}</strong>
                    <span>{t("keepOpen")}</span>
                  </div>
                </div>
                <div className="generation-progress">
                  <span />
                </div>
                <details className="result-details">
                  <summary>
                    <span>{t("generationDetails")}</span>
                    <strong>{getAspectRatioLabel(pendingGeneration.aspectRatio)} / {pendingGeneration.quality}</strong>
                    <ChevronDown size={16} />
                  </summary>
                  <p className="result-prompt">{pendingGeneration.prompt}</p>
                </details>
              </div>
            ) : selectedRecord ? (
              <div className="result-stage">
                <div className="result-meta">
                  <span className="tag is-provider">{getProviderLabel(catalog, selectedRecord.provider)}</span>
                  <span className="tag">{getModelLabel(catalog, selectedRecord.provider, selectedRecord.model)}</span>
                  <span className="tag">{selectedRecord.mode === "text-to-image" ? t("text") : t("imageInput")}</span>
                  <span className="tag">{formatDate(selectedRecord.createdAt)}</span>
                </div>
                <button className="hero-image-button" type="button" onClick={() => setLightboxRecordId(selectedRecord.id)} title={t("preview")}>
                  <img className="hero-result-image" src={selectedRecord.imageUrl} alt={t("imagePreview")} />
                  <span>
                    <ExternalLink size={15} />
                    {t("preview")}
                  </span>
                </button>
                <div className="result-actions">
                  <button
                    className="text-button"
                    title={t("editThisImage")}
                    type="button"
                    disabled={!selectedRecordCanContinue}
                    onClick={() => startContinueEdit(selectedRecord)}
                  >
                    <ImagePlus size={17} />
                    {t("editThisImage")}
                  </button>
                  <button className="text-button" title={t("copyLink")} type="button" onClick={() => void copyImage(selectedRecord)}>
                    {copiedId === selectedRecord.id ? <Check size={17} /> : <Copy size={17} />}
                    {copiedId === selectedRecord.id ? t("copied") : t("copyLink")}
                  </button>
                  <a className="text-button" title={t("download")} href={selectedRecord.imageUrl} download>
                    <Download size={17} />
                    {t("download")}
                  </a>
                  <a className="text-button" title={t("open")} href={selectedRecord.imageUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={17} />
                    {t("open")}
                  </a>
                </div>
                <details className="result-details">
                  <summary>
                    <span>{t("generationDetails")}</span>
                    <strong>
                      {selectedRecord.aspectRatio ?? selectedRecord.size ?? "-"}
                      {selectedRecord.quality ? ` / ${selectedRecord.quality}` : ""}
                    </strong>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="result-detail-body">
                    <div className="result-detail-head">
                      <span>{t("promptUsed")}</span>
                      <button className="text-button tiny" type="button" onClick={() => void copyPromptText(selectedRecord)}>
                        {copiedPromptId === selectedRecord.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedPromptId === selectedRecord.id ? t("copied") : t("copyPrompt")}
                      </button>
                    </div>
                    <p className="result-prompt">{selectedRecord.prompt}</p>
                  </div>
                </details>
              </div>
            ) : (
              <div className="result-empty">
                <Sparkles size={36} />
                <h2>{t("noImageYet")}</h2>
                <p>{selectedModel?.description ?? t("emptyResult")}</p>
              </div>
            )}

            <div className="history-panel">
              <div className="section-row">
                <p className="section-label">{t("history")}</p>
                <span>{filteredRecords.length} {t("images")}</span>
              </div>
              {filteredRecords.length > 0 ? (
                <div className="history-grid">
                  {filteredRecords.map((record) => (
                    <button
                      className={`history-thumb ${selectedRecord?.id === record.id ? "is-selected" : ""}`}
                      key={record.id}
                      type="button"
                      onClick={() => setSelectedRecordId(record.id)}
                      title={record.prompt}
                    >
                      <img src={record.imageUrl} alt={t("imagePreview")} />
                      <span>{getProviderLabel(catalog, record.provider)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="history-empty">{t("historyEmpty")}</p>
              )}
            </div>
          </section>
        </section>
      </main>

      {lightboxRecord && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={t("imagePreview")}>
          <button className="lightbox-scrim" type="button" aria-label={t("closePreview")} onClick={() => setLightboxRecordId("")} />
          <div className="lightbox-panel">
            <div className="lightbox-head">
              <div className="result-meta">
                <span className="tag is-provider">{getProviderLabel(catalog, lightboxRecord.provider)}</span>
                <span className="tag">{getModelLabel(catalog, lightboxRecord.provider, lightboxRecord.model)}</span>
                <span className="tag">{lightboxRecord.aspectRatio ?? lightboxRecord.size ?? "-"}</span>
              </div>
              <button className="icon-button" type="button" title={t("closePreview")} onClick={() => setLightboxRecordId("")}>
                <X size={18} />
              </button>
            </div>
            <div className="lightbox-image-wrap">
              <img src={lightboxRecord.imageUrl} alt={t("imagePreview")} />
            </div>
            <details className="lightbox-prompt">
              <summary>
                <span>{t("promptUsed")}</span>
                <button className="text-button tiny" type="button" onClick={() => void copyPromptText(lightboxRecord)}>
                  {copiedPromptId === lightboxRecord.id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedPromptId === lightboxRecord.id ? t("copied") : t("copyPrompt")}
                </button>
              </summary>
              <p>{lightboxRecord.prompt}</p>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
