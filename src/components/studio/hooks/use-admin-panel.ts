import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/types";
import { fetchJson } from "@/components/studio/utils/api-client";

export type AdminOverview = {
  settings: {
    registrationOpen: boolean;
    dailyPlatformQuota: number;
    siteTitle?: string | null;
    faviconUrl?: string | null;
    logoUrl?: string | null;
  };
  platformProvider: {
    keys: Record<string, { configured: boolean }>;
    baseUrls: Partial<Record<string, string>>;
    models: Partial<Record<string, string>>;
  };
  jobQueue: {
    queue: {
      enabled: boolean;
      ok: boolean;
      target: string;
      error?: string;
    };
    bullmq?: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      completed: number;
    };
    concurrency: number;
    userConcurrency: number;
    active: number;
    queued: number;
    pending: number;
    running: number;
    recentFailed: number;
    recentSucceeded: number;
    recent: {
      inspected: number;
      averageQueueWaitMs: number | null;
      averageExecutionMs: number | null;
      averageUpstreamMs: number | null;
      averageFileSaveMs: number | null;
    };
    providerHealth: Array<{
      provider: string;
      status: "healthy" | "degraded" | "failing" | "idle";
      total: number;
      succeeded: number;
      failed: number;
      failureRate: number;
      averageExecutionMs: number | null;
      averageUpstreamMs: number | null;
    }>;
    modelUsage: Array<{
      provider: string;
      model: string;
      total: number;
      succeeded: number;
      failed: number;
      averageExecutionMs: number | null;
    }>;
    failureReasons: Array<{
      reason: string;
      count: number;
      sample: string;
      latestAt: string;
    }>;
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

type UseAdminPanelOptions = {
  open: boolean;
  currentUser: PublicUser | null;
  locale: "en" | "zh";
  onUnauthorized: (errorOrResponse: unknown) => boolean;
  onBrandingReload: () => Promise<unknown>;
  onCatalogReload: () => Promise<unknown>;
};

export function useAdminPanel({
  open,
  currentUser,
  locale,
  onUnauthorized,
  onBrandingReload,
  onCatalogReload
}: UseAdminPanelOptions) {
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const [platformOpenaiKey, setPlatformOpenaiKey] = useState("");
  const [platformOpenaiBaseUrl, setPlatformOpenaiBaseUrl] = useState("");
  const [platformOpenaiModel, setPlatformOpenaiModel] = useState("");

  function resetAdminPanelState() {
    setAdminOverview(null);
    setAdminMessage("");
    setNewUserEmail("");
    setNewUserPassword("");
    setDeletingUserId("");
    setPlatformOpenaiKey("");
    setPlatformOpenaiBaseUrl("");
    setPlatformOpenaiModel("");
  }

  async function loadAdminOverview() {
    let body: AdminOverview;
    try {
      body = await fetchJson<AdminOverview>("/api/admin/overview", {
        cache: "no-store",
        fallbackMessage: "Admin overview could not be loaded."
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    }

    setAdminOverview(body);
    setPlatformOpenaiBaseUrl(body.platformProvider?.baseUrls?.openai ?? "");
    setPlatformOpenaiModel(body.platformProvider?.models?.openai ?? "");
  }

  async function saveAdminSettings(next?: Partial<AdminOverview["settings"]>) {
    if (!adminOverview) return;
    setAdminMessage("");
    const settings = { ...adminOverview.settings, ...next };
    try {
      await fetchJson("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
        fallbackMessage: "Admin settings could not be saved."
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setAdminMessage(caught instanceof Error ? caught.message : "Admin settings could not be saved.");
      return;
    }

    setAdminMessage("Admin settings saved.");
    await onBrandingReload();
    await loadAdminOverview();
  }

  async function createAdminUser() {
    setAdminMessage("");
    try {
      await fetchJson("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newUserEmail, password: newUserPassword, role: "USER" }),
        fallbackMessage: "User could not be created."
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setAdminMessage(caught instanceof Error ? caught.message : "User could not be created.");
      return;
    }

    setNewUserEmail("");
    setNewUserPassword("");
    setAdminMessage("User created.");
    await loadAdminOverview();
  }

  async function toggleUserDisabled(user: PublicUser) {
    try {
      await fetchJson(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
        fallbackMessage: "User could not be updated."
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setAdminMessage(caught instanceof Error ? caught.message : "User could not be updated.");
      return;
    }
    await loadAdminOverview();
  }

  async function deleteAdminUser(user: PublicUser) {
    if (deletingUserId || user.id === currentUser?.id) return;

    const confirmed = window.confirm(`${locale === "zh" ? "\u5220\u9664\u7528\u6237" : "Delete user"}: ${user.email}`);
    if (!confirmed) return;

    setDeletingUserId(user.id);
    setAdminMessage("");

    try {
      await fetchJson(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        fallbackMessage: "User could not be deleted."
      });

      setAdminMessage("User deleted.");
      await loadAdminOverview();
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setAdminMessage(caught instanceof Error ? caught.message : "User could not be deleted.");
    } finally {
      setDeletingUserId("");
    }
  }

  async function savePlatformProvider() {
    setAdminMessage("");
    try {
      await fetchJson("/api/admin/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keys: {
            openai: platformOpenaiKey
          },
          baseUrls: {
            openai: platformOpenaiBaseUrl
          },
          models: {
            openai: platformOpenaiModel
          }
        }),
        fallbackMessage: "Platform provider settings could not be saved."
      });
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      setAdminMessage(caught instanceof Error ? caught.message : "Platform provider settings could not be saved.");
      return;
    }

    setPlatformOpenaiKey("");
    setAdminMessage("Platform provider saved.");
    await loadAdminOverview();
    await onCatalogReload();
  }

  useEffect(() => {
    if (!open || currentUser?.role !== "ADMIN") return;
    void loadAdminOverview().catch(() => setAdminMessage("Admin overview could not be loaded."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Refresh admin overview when the panel opens or the current user changes.
  }, [open, currentUser?.id, currentUser?.role]);

  return {
    adminOverview,
    setAdminOverview,
    adminMessage,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    deletingUserId,
    platformOpenaiKey,
    setPlatformOpenaiKey,
    platformOpenaiBaseUrl,
    setPlatformOpenaiBaseUrl,
    platformOpenaiModel,
    setPlatformOpenaiModel,
    resetAdminPanelState,
    saveAdminSettings,
    createAdminUser,
    toggleUserDisabled,
    deleteAdminUser,
    savePlatformProvider
  };
}
