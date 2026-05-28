import type { ImageMode } from "@/lib/models";
import type { PromptTemplateResponse } from "@/lib/types";
import type { Locale } from "@/components/studio/utils/copy";
import {
  DEFAULT_MODE,
  DEFAULT_RESOLUTION,
  type GenerationInputMode,
  type QuickMenu,
  type StudioLayout,
  type StudioView
} from "@/components/studio/utils/generation-options";

export type HistoryFilter = {
  provider: "all" | string;
  model: "all" | string;
};

export type PromptTemplateMode = PromptTemplateResponse["mode"];

export type StudioState = {
  selectedRecordId: string;
  activeView: StudioView;
  studioLayout: StudioLayout;
  provider: string;
  model: string;
  mode: ImageMode;
  prompt: string;
  generationInputMode: GenerationInputMode;
  batchPromptText: string;
  jobMonitorOpen: boolean;
  topbarMenuOpen: boolean;
  aspectRatio: string;
  resolution: string;
  quality: string;
  inputFidelity: string;
  files: File[];
  sourceImageIds: string[];
  historyFilter: HistoryFilter;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
  historySearch: string;
  favoriteOnly: boolean;
  favoriteRecordIds: string[];
  selectedHistoryIds: string[];
  deletingHistoryIds: string[];
  favoritesLoaded: boolean;
  filePreviewUrls: string[];
  settingsOpen: boolean;
  adminOpen: boolean;
  paramsOpen: boolean;
  historyFiltersOpen: boolean;
  quickMenu: QuickMenu;
  loading: boolean;
  referenceDragging: boolean;
  locale: Locale;
  error: string;
  copiedId: string;
  copiedPromptId: string;
  newProjectName: string;
  assignProjectId: string;
  assignTagsText: string;
  templateTitle: string;
  templateCategory: string;
  templateMode: PromptTemplateMode;
  templateOpen: boolean;
  deletingTemplateId: string;
};

export function createInitialStudioState(): StudioState {
  return {
    selectedRecordId: "",
    activeView: "gallery",
    studioLayout: "controls-left",
    provider: "openai",
    model: "gpt-image-2",
    mode: DEFAULT_MODE,
    prompt: "",
    generationInputMode: "single",
    batchPromptText: "",
    jobMonitorOpen: false,
    topbarMenuOpen: false,
    aspectRatio: "1:1",
    resolution: DEFAULT_RESOLUTION,
    quality: "medium",
    inputFidelity: "high",
    files: [],
    sourceImageIds: [],
    historyFilter: { provider: "all", model: "all" },
    historyBatchFilter: "all",
    historyProjectFilter: "all",
    historyTagFilter: "",
    historySearch: "",
    favoriteOnly: false,
    favoriteRecordIds: [],
    selectedHistoryIds: [],
    deletingHistoryIds: [],
    favoritesLoaded: false,
    filePreviewUrls: [],
    settingsOpen: false,
    adminOpen: false,
    paramsOpen: false,
    historyFiltersOpen: false,
    quickMenu: null,
    loading: false,
    referenceDragging: false,
    locale: "zh",
    error: "",
    copiedId: "",
    copiedPromptId: "",
    newProjectName: "",
    assignProjectId: "",
    assignTagsText: "",
    templateTitle: "",
    templateCategory: "",
    templateMode: "universal",
    templateOpen: false,
    deletingTemplateId: ""
  };
}
