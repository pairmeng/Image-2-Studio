"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";
import {
  createAdminUser,
  createAdminProvider,
  deleteAdminUser,
  loadAdminAuditLogs,
  loadAdminImages,
  loadAdminJobs,
  loadAdminMonitor,
  loadAdminOverview,
  loadAdminProviders,
  loadAdminUsage,
  runAdminJobAction,
  saveAdminSettings,
  saveAdminProvider,
  testAdminProvider,
  updateAdminUser,
  type AdminAuditLogRecord,
  type AdminProviderSaveInput,
  type AdminProvidersResponse,
  type AdminImageFilters,
  type AdminImageRecord,
  type AdminJobFilters,
  type AdminJobRecord,
  type AdminMonitorResponse,
  type AdminOverview,
  type AdminUsageResponse
} from "@/components/admin/utils/admin-api";

export type AdminTab = "overview" | "settings" | "providers" | "users" | "usage" | "monitor" | "images" | "audit";

const emptyImageFilters: AdminImageFilters = {
  userId: "",
  provider: "",
  model: "",
  dateFrom: "",
  dateTo: "",
  q: ""
};

const emptyJobFilters: AdminJobFilters = {
  status: "",
  userId: "",
  provider: "",
  model: "",
  dateFrom: "",
  dateTo: "",
  q: ""
};

const emptyProviderDraft: AdminProviderSaveInput = {
  providerId: "openai",
  adapterId: "openai",
  label: "OpenAI",
  enabled: true,
  key: "",
  baseUrl: "",
  defaultModel: "gpt-image-2",
  models: [],
  priority: 10
};

export function useAdminConsole(currentUser: PublicUser) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null);
  const [monitor, setMonitor] = useState<AdminMonitorResponse | null>(null);
  const [providers, setProviders] = useState<AdminProvidersResponse | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState("openai");
  const [providerDraft, setProviderDraft] = useState<AdminProviderSaveInput>(emptyProviderDraft);
  const [adminJobs, setAdminJobs] = useState<AdminJobRecord[]>([]);
  const [adminJobCursor, setAdminJobCursor] = useState<string | undefined>();
  const [adminJobFilters, setAdminJobFilters] = useState<AdminJobFilters>(emptyJobFilters);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRecord[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | undefined>();
  const [images, setImages] = useState<AdminImageRecord[]>([]);
  const [imageCursor, setImageCursor] = useState<string | undefined>();
  const [imageFilters, setImageFilters] = useState<AdminImageFilters>(emptyImageFilters);
  const [selectedImage, setSelectedImage] = useState<AdminImageRecord | null>(null);
  const [usageRange, setUsageRange] = useState<"7d" | "30d">("7d");
  const [usageUserId, setUsageUserId] = useState("");
  const [queueRedisUrl, setQueueRedisUrl] = useState("");
  const [clearQueueRedisUrl, setClearQueueRedisUrl] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"ADMIN" | "USER">("USER");
  const [userSearch, setUserSearch] = useState("");
  const [resetPasswordUserId, setResetPasswordUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshOverview = useCallback(async () => {
    const body = await loadAdminOverview();
    setOverview(body);
  }, []);

  const refreshUsage = useCallback(async () => {
    setUsage(await loadAdminUsage(usageRange, usageUserId));
  }, [usageRange, usageUserId]);

  const refreshMonitor = useCallback(async () => {
    setMonitor(await loadAdminMonitor());
  }, []);

  const refreshAdminJobs = useCallback(async (options: { append?: boolean; cursor?: string } = {}) => {
    const page = await loadAdminJobs({
      filters: adminJobFilters,
      cursor: options.cursor
    });
    setAdminJobs((current) => options.append ? [...current, ...page.records] : page.records);
    setAdminJobCursor(page.nextCursor);
  }, [adminJobFilters]);

  const refreshImages = useCallback(async (options: { append?: boolean; cursor?: string } = {}) => {
    const page = await loadAdminImages({
      filters: imageFilters,
      cursor: options.cursor
    });
    setImages((current) => options.append ? [...current, ...page.records] : page.records);
    setImageCursor(page.nextCursor);
  }, [imageFilters]);

  const refreshAuditLogs = useCallback(async (options: { append?: boolean; cursor?: string } = {}) => {
    const page = await loadAdminAuditLogs({ cursor: options.cursor });
    setAuditLogs((current) => options.append ? [...current, ...page.records] : page.records);
    setAuditCursor(page.nextCursor);
  }, []);

  const runAction = useCallback(async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void runAction("initial", async () => {
      await refreshOverview();
    });
  }, [refreshOverview, runAction]);

  useEffect(() => {
    if (activeTab === "usage") {
      void runAction("usage", refreshUsage);
    }
  }, [activeTab, refreshUsage, runAction]);

  useEffect(() => {
    if (activeTab === "monitor") {
      void runAction("monitor", async () => {
        await Promise.all([
          refreshMonitor(),
          refreshAdminJobs()
        ]);
      });
    }
  }, [activeTab, refreshAdminJobs, refreshMonitor, runAction]);

  useEffect(() => {
    if (activeTab === "images") {
      void runAction("images", () => refreshImages());
    }
  }, [activeTab, imageFilters, refreshImages, runAction]);

  useEffect(() => {
    if (activeTab === "audit") {
      void runAction("audit", () => refreshAuditLogs());
    }
  }, [activeTab, refreshAuditLogs, runAction]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const users = overview?.users ?? [];
    if (!query) return users;

    return users.filter((user) => user.email.toLowerCase().includes(query) || user.role.toLowerCase().includes(query));
  }, [overview?.users, userSearch]);

  async function saveSettings() {
    if (!overview) return;
    await runAction("settings", async () => {
      const saved = await saveAdminSettings({
        ...overview.settings,
        imageQueueRedisUrl: queueRedisUrl,
        clearImageQueueRedisUrl: clearQueueRedisUrl
      });
      setQueueRedisUrl("");
      setClearQueueRedisUrl(false);
      setOverview((current) => current ? { ...current, settings: saved.settings } : current);
      setMessage("平台设置已保存。");
      await refreshOverview();
      if (monitor) {
        await refreshMonitor();
      }
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  function selectProviderForEdit(provider: AdminProvidersResponse["providers"][number]) {
    setSelectedProviderId(provider.providerId);
    setProviderDraft({
      providerId: provider.providerId,
      adapterId: provider.adapterId,
      label: provider.label,
      enabled: provider.enabled,
      key: "",
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel ?? "",
      models: provider.models,
      priority: provider.priority
    });
  }

  const refreshProviders = useCallback(async (nextSelectedProviderId?: string) => {
    const body = await loadAdminProviders();
    setProviders(body);
    const targetProviderId = nextSelectedProviderId ?? selectedProviderId;
    const selected = body.providers.find((provider) => provider.providerId === targetProviderId) ?? body.providers[0];
    if (selected) {
      selectProviderForEdit(selected);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    if (activeTab === "providers") {
      void runAction("providers", refreshProviders);
    }
  }, [activeTab, refreshProviders, runAction]);

  function updateProviderDraft(next: Partial<AdminProviderSaveInput>) {
    setProviderDraft((current) => ({ ...current, ...next }));
  }

  function addProviderDraft() {
    setSelectedProviderId("");
    setProviderDraft({
      ...emptyProviderDraft,
      providerId: "custom-provider",
      adapterId: "openai-compatible",
      label: "Custom Provider",
      defaultModel: "custom-image-model",
      priority: 100
    });
  }

  async function saveProviderDraft() {
    await runAction("provider-save", async () => {
      const isExisting = Boolean(providers?.providers.some((provider) => provider.providerId === selectedProviderId));
      const saved = isExisting
        ? await saveAdminProvider(providerDraft)
        : await createAdminProvider(providerDraft);
      setMessage("供应商配置已保存。");
      setSelectedProviderId(saved.provider.providerId);
      await refreshProviders(saved.provider.providerId);
      await refreshOverview();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function testProviderDraft(providerId: string) {
    if (!providerId) return;
    await runAction("provider-test", async () => {
      const result = await testAdminProvider(providerId);
      setMessage(result.message);
      await refreshProviders();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function createUser() {
    await runAction("create-user", async () => {
      await createAdminUser({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole
      });
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("USER");
      setMessage("用户已创建。");
      await refreshOverview();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function toggleUserDisabled(user: PublicUser) {
    await runAction(`toggle-${user.id}`, async () => {
      await updateAdminUser(user.id, { disabled: !user.disabled });
      await refreshOverview();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function changeUserRole(user: PublicUser, role: "ADMIN" | "USER") {
    await runAction(`role-${user.id}`, async () => {
      await updateAdminUser(user.id, { role });
      await refreshOverview();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function resetUserPassword(user: PublicUser) {
    await runAction(`password-${user.id}`, async () => {
      await updateAdminUser(user.id, { password: resetPassword });
      setResetPassword("");
      setResetPasswordUserId("");
      setMessage(`已重置 ${user.email} 的密码。`);
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  async function removeUser(user: PublicUser) {
    if (user.id === currentUser.id) return;
    const confirmed = window.confirm(`删除用户：${user.email}`);
    if (!confirmed) return;

    await runAction(`delete-${user.id}`, async () => {
      await deleteAdminUser(user.id);
      await refreshOverview();
      if (auditLogs.length > 0 || activeTab === "audit") {
        await refreshAuditLogs();
      }
    });
  }

  function updateSettings(next: Partial<AdminOverview["settings"]>) {
    setOverview((current) => current ? {
      ...current,
      settings: {
        ...current.settings,
        ...next
      }
    } : current);
  }

  function updateImageFilters(next: Partial<AdminImageFilters>) {
    setImageCursor(undefined);
    setImageFilters((current) => ({
      ...current,
      ...next
    }));
  }

  function resetImageFilters() {
    setImageCursor(undefined);
    setImageFilters(emptyImageFilters);
  }

  function updateAdminJobFilters(next: Partial<AdminJobFilters>) {
    setAdminJobCursor(undefined);
    setAdminJobFilters((current) => ({
      ...current,
      ...next
    }));
  }

  function resetAdminJobFilters() {
    setAdminJobCursor(undefined);
    setAdminJobFilters(emptyJobFilters);
  }

  async function executeAdminJobAction(action: "pause" | "resume" | "kill" | "retry", jobIds: string[]) {
    await runAction(`job-${action}`, async () => {
      await runAdminJobAction(action, jobIds);
      setMessage("任务操作已提交。");
      await Promise.all([
        refreshMonitor(),
        refreshAdminJobs(),
        activeTab === "audit" || auditLogs.length > 0 ? refreshAuditLogs() : Promise.resolve()
      ]);
    });
  }

  return {
    activeTab,
    setActiveTab,
    overview,
    usage,
    monitor,
    providers,
    selectedProviderId,
    providerDraft,
    adminJobs,
    adminJobCursor,
    adminJobFilters,
    auditLogs,
    auditCursor,
    images,
    imageCursor,
    imageFilters,
    selectedImage,
    setSelectedImage,
    usageRange,
    setUsageRange,
    usageUserId,
    setUsageUserId,
    queueRedisUrl,
    setQueueRedisUrl,
    clearQueueRedisUrl,
    setClearQueueRedisUrl,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    newUserRole,
    setNewUserRole,
    userSearch,
    setUserSearch,
    filteredUsers,
    resetPasswordUserId,
    setResetPasswordUserId,
    resetPassword,
    setResetPassword,
    busy,
    message,
    error,
    refreshOverview: () => runAction("overview", refreshOverview),
    refreshUsage: () => runAction("usage", refreshUsage),
    refreshMonitor: () => runAction("monitor", refreshMonitor),
    refreshProviders: () => runAction("providers", refreshProviders),
    refreshAdminJobs: () => runAction("admin-jobs", () => refreshAdminJobs()),
    refreshImages: () => runAction("images", () => refreshImages()),
    refreshAuditLogs: () => runAction("audit", () => refreshAuditLogs()),
    loadMoreAuditLogs: () => runAction("audit-more", () => refreshAuditLogs({ append: true, cursor: auditCursor })),
    loadMoreImages: () => runAction("images-more", () => refreshImages({ append: true, cursor: imageCursor })),
    loadMoreAdminJobs: () => runAction("admin-jobs-more", () => refreshAdminJobs({ append: true, cursor: adminJobCursor })),
    saveSettings,
    selectProviderForEdit,
    updateProviderDraft,
    addProviderDraft,
    saveProviderDraft,
    testProviderDraft,
    createUser,
    toggleUserDisabled,
    changeUserRole,
    resetUserPassword,
    removeUser,
    updateSettings,
    updateImageFilters,
    resetImageFilters,
    updateAdminJobFilters,
    resetAdminJobFilters,
    executeAdminJobAction
  };
}
