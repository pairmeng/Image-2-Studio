import { useState } from "react";
import type { HistoryResponse, ImageBatchResponse, ImageProjectResponse, ImageRecord, PromptTemplateResponse } from "@/lib/types";
import { mergeHistoryRecords } from "@/lib/history-records";
import { fetchJson } from "@/components/studio/utils/api-client";

type LoadHistoryOptions = {
  reset?: boolean;
  selectFirst?: boolean;
};

type UseGalleryDataOptions = {
  pageSize: number;
  messages: {
    historyLoadFailed: string;
    batchesLoadFailed: string;
    projectsLoadFailed: string;
    templatesLoadFailed: string;
    generationFailed: string;
  };
  onUnauthorized: (errorOrResponse: unknown) => boolean;
  onError: (message: string) => void;
  onSelectFirstRecord: (recordId: string) => void;
};

export function useGalleryData({
  pageSize,
  messages,
  onUnauthorized,
  onError,
  onSelectFirstRecord
}: UseGalleryDataOptions) {
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [batches, setBatches] = useState<ImageBatchResponse[]>([]);
  const [projects, setProjects] = useState<ImageProjectResponse[]>([]);
  const [templates, setTemplates] = useState<PromptTemplateResponse[]>([]);

  function resetGalleryData() {
    setRecords([]);
    setHistoryNextCursor(undefined);
    setBatches([]);
    setProjects([]);
    setTemplates([]);
  }

  async function loadHistory(options: { selectFirst?: boolean } = {}) {
    return loadHistoryPage({ reset: true, selectFirst: options.selectFirst });
  }

  async function loadHistoryPage(options: LoadHistoryOptions = {}) {
    if (historyLoading) return;

    const cursor = options.reset ? undefined : historyNextCursor;
    if (!options.reset && !cursor) return;

    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) params.set("cursor", cursor);

      const body = await fetchJson<HistoryResponse>(`/api/images/history?${params.toString()}`, {
        cache: "no-store",
        fallbackMessage: messages.historyLoadFailed
      });
      const nextRecords = Array.isArray(body.records) ? body.records : [];

      setRecords((current) => options.reset ? nextRecords : mergeHistoryRecords(current, nextRecords));
      setHistoryNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : undefined);
      if (options.selectFirst !== false) {
        onSelectFirstRecord(nextRecords[0]?.id || "");
      }
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadBatches() {
    try {
      const body = await fetchJson<{ batches?: ImageBatchResponse[] }>("/api/images/batches?limit=30", {
        cache: "no-store",
        fallbackMessage: messages.batchesLoadFailed
      });
      setBatches(Array.isArray(body.batches) ? body.batches : []);
    } catch (loadError) {
      if (onUnauthorized(loadError)) return;
      onError(loadError instanceof Error ? loadError.message : messages.generationFailed);
    }
  }

  async function loadProjects() {
    try {
      const body = await fetchJson<{ projects?: ImageProjectResponse[] }>("/api/images/projects", {
        cache: "no-store",
        fallbackMessage: messages.projectsLoadFailed
      });
      setProjects(Array.isArray(body.projects) ? body.projects : []);
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    }
  }

  async function loadTemplates() {
    try {
      const body = await fetchJson<{ templates?: PromptTemplateResponse[] }>("/api/images/templates", {
        cache: "no-store",
        fallbackMessage: messages.templatesLoadFailed
      });
      setTemplates(Array.isArray(body.templates) ? body.templates : []);
    } catch (caught) {
      if (onUnauthorized(caught)) return;
      throw caught;
    }
  }

  async function loadGalleryMeta() {
    await Promise.all([
      loadBatches(),
      loadProjects(),
      loadTemplates()
    ]);
  }

  return {
    records,
    setRecords,
    historyNextCursor,
    setHistoryNextCursor,
    historyLoading,
    batches,
    setBatches,
    projects,
    setProjects,
    templates,
    setTemplates,
    resetGalleryData,
    loadHistory,
    loadHistoryPage,
    loadBatches,
    loadProjects,
    loadTemplates,
    loadGalleryMeta
  };
}
