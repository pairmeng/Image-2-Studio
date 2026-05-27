import type { ImageProjectResponse, ImageRecord } from "@/lib/types";
import type { Locale } from "@/components/studio/utils/copy";
import { useStudioState } from "@/components/studio/state/studio-context";
import { fetchBlob, fetchJson } from "@/components/studio/utils/api-client";
import {
  getAssignImagesFailedMessage,
  getCreateProjectFailedMessage,
  getDeletedHistoryIds,
  getDeleteHistoryImagesConfirmMessage,
  getExportImagesFailedMessage,
  getExportZipFileName,
  getHistoryImageDownloadDelay,
  getHistoryImageDownloadFileName,
  getHistoryImagesDeleteFailedMessage,
  getUniqueHistoryIds,
  mergeHistoryIds,
  removeHistoryIds,
  parseAssignTags
} from "@/components/studio/utils/history-action-helpers";
import { formatImageRecordLinks } from "@/components/studio/utils/image-links";

type UseHistoryActionsOptions = {
  locale: Locale;
  filteredRecords: ImageRecord[];
  selectedHistoryRecords: ImageRecord[];
  lightboxRecordId: string;
  t: (key: string) => string;
  handleUnauthorized: (errorOrResponse: unknown) => boolean;
  closeLightbox: () => void;
  loadHistory: () => Promise<unknown>;
  loadProjects: () => Promise<void>;
  setRecords: (value: ImageRecord[] | ((current: ImageRecord[]) => ImageRecord[])) => void;
  setHistoryNextCursor: (value: string | undefined) => void;
};

export function useHistoryActions({
  locale,
  filteredRecords,
  selectedHistoryRecords,
  lightboxRecordId,
  t,
  handleUnauthorized,
  closeLightbox,
  loadHistory,
  loadProjects,
  setRecords,
  setHistoryNextCursor
}: UseHistoryActionsOptions) {
  const { state, actions } = useStudioState();
  const {
    selectedHistoryIds,
    newProjectName,
    assignProjectId,
    assignTagsText
  } = state;
  const {
    setTopbarMenuOpen,
    setSelectedHistoryIds,
    setFavoriteRecordIds,
    setDeletingHistoryIds,
    setSourceImageIds,
    setSelectedRecordId,
    setCopiedId,
    setCopiedPromptId,
    setError,
    setNewProjectName,
    setAssignProjectId
  } = actions;

  function toggleFavoriteRecord(id: string) {
    setFavoriteRecordIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [id, ...current];
    });
  }

  function toggleHistorySelection(id: string) {
    setSelectedHistoryIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function selectAllVisibleHistory() {
    setSelectedHistoryIds(filteredRecords.map((record) => record.id));
  }

  async function copySelectedImageLinks() {
    await navigator.clipboard.writeText(formatImageRecordLinks(selectedHistoryRecords, window.location.origin));
  }

  function downloadSelectedImages() {
    selectedHistoryRecords.forEach((record, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = record.imageUrl;
        link.download = getHistoryImageDownloadFileName(record.id);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, getHistoryImageDownloadDelay(index));
    });
  }

  async function deleteHistoryImages(ids: string[]) {
    const uniqueIds = getUniqueHistoryIds(ids);
    if (uniqueIds.length === 0) return;

    const confirmed = window.confirm(getDeleteHistoryImagesConfirmMessage(uniqueIds.length, locale));
    if (!confirmed) return;

    setError("");
    setDeletingHistoryIds((current) => mergeHistoryIds(current, uniqueIds));
    const fallbackMessage = getHistoryImagesDeleteFailedMessage(locale);

    try {
      const body = await fetchJson<{ deletedIds?: unknown }>("/api/images/history", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds }),
        fallbackMessage
      });

      const deletedIds = getDeletedHistoryIds(body.deletedIds, uniqueIds);
      const deletedSet = new Set(deletedIds);

      setRecords((current) => current.filter((record) => !deletedSet.has(record.id)));
      setSelectedHistoryIds((current) => removeHistoryIds(current, deletedIds));
      setFavoriteRecordIds((current) => removeHistoryIds(current, deletedIds));
      setSourceImageIds((current) => removeHistoryIds(current, deletedIds));
      setSelectedRecordId((current) => deletedSet.has(current) ? "" : current);
      if (lightboxRecordId && deletedSet.has(lightboxRecordId)) {
        closeLightbox();
      }
      setCopiedId((current) => deletedSet.has(current) ? "" : current);
      setCopiedPromptId((current) => deletedSet.has(current) ? "" : current);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setDeletingHistoryIds((current) => removeHistoryIds(current, uniqueIds));
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;

    const fallbackMessage = getCreateProjectFailedMessage(locale);
    let body: Partial<ImageProjectResponse>;

    try {
      body = await fetchJson<Partial<ImageProjectResponse>>("/api/images/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    if (!body.id) {
      setError(fallbackMessage);
      return;
    }

    setNewProjectName("");
    setAssignProjectId(body.id);
    await loadProjects();
  }

  async function assignSelectedImages() {
    if (selectedHistoryIds.length === 0) return;

    const fallbackMessage = getAssignImagesFailedMessage(locale);
    try {
      await fetchJson("/api/images/projects/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordIds: selectedHistoryIds,
          projectId: assignProjectId || null,
          tags: parseAssignTags(assignTagsText)
        }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    await Promise.all([loadHistory(), loadProjects()]);
    setSelectedHistoryIds([]);
  }

  async function exportSelectedImagesZip() {
    if (selectedHistoryIds.length === 0) return;

    let blob: Blob;
    const fallbackMessage = getExportImagesFailedMessage(locale);
    try {
      blob = await fetchBlob("/api/images/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedHistoryIds, naming: "prompt" }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getExportZipFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function archiveSelectedImages() {
    const uniqueIds = getUniqueHistoryIds(selectedHistoryIds);
    if (uniqueIds.length === 0) return;

    setError("");
    const fallbackMessage = locale === "zh" ? "归档图片失败。" : "Images could not be archived.";

    try {
      await fetchJson("/api/images/history/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds, archived: true }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    const archivedSet = new Set(uniqueIds);
    setRecords((current) => current.filter((record) => !archivedSet.has(record.id)));
    setSelectedHistoryIds((current) => removeHistoryIds(current, uniqueIds));
    setFavoriteRecordIds((current) => removeHistoryIds(current, uniqueIds));
    setSourceImageIds((current) => removeHistoryIds(current, uniqueIds));
    setSelectedRecordId((current) => archivedSet.has(current) ? "" : current);
    if (lightboxRecordId && archivedSet.has(lightboxRecordId)) {
      closeLightbox();
    }
  }

  async function clearHistory() {
    setTopbarMenuOpen(false);
    if (!window.confirm(t("clearHistoryConfirm"))) return;

    setError("");

    try {
      await fetchJson("/api/images/history/clear", {
        method: "POST",
        fallbackMessage: t("clearHistoryFailed")
      });

      setRecords([]);
      setHistoryNextCursor(undefined);
      setSourceImageIds([]);
      setSelectedRecordId("");
      closeLightbox();
      setSelectedHistoryIds([]);
      setFavoriteRecordIds([]);
      setDeletingHistoryIds([]);
      setCopiedId("");
      setCopiedPromptId("");
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : t("clearHistoryFailed"));
    }
  }

  return {
    toggleFavoriteRecord,
    toggleHistorySelection,
    selectAllVisibleHistory,
    copySelectedImageLinks,
    downloadSelectedImages,
    deleteHistoryImages,
    createProject,
    assignSelectedImages,
    archiveSelectedImages,
    exportSelectedImagesZip,
    clearHistory
  };
}
