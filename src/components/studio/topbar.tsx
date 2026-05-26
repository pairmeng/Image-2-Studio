import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Check,
  Ellipsis,
  ImagePlus,
  Languages,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  UserCog,
  X
} from "lucide-react";
import type { CatalogResponse, ImageBatchResponse, ImageProjectResponse, PublicUser } from "@/lib/types";
import type { Locale } from "@/components/studio/utils/copy";
import type { HistoryFilter } from "@/components/studio/state/studio-context";

type TopbarProps = {
  activeView: "gallery" | "studio";
  brandMark: ReactNode;
  siteTitle: string;
  providerLabel: string;
  modelLabel: string;
  catalog: CatalogResponse | null;
  currentUser: PublicUser;
  locale: Locale;
  historySearch: string;
  favoriteOnly: boolean;
  historyFiltersOpen: boolean;
  historyFiltersActive: boolean;
  historyFilter: HistoryFilter;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
  batches: ImageBatchResponse[];
  projects: ImageProjectResponse[];
  allTags: string[];
  topbarMenuOpen: boolean;
  historyLoading: boolean;
  recordsLength: number;
  hasHistoryNextCursor: boolean;
  runNotice: string;
  jobMonitor: ReactNode;
  t: (key: string) => string;
  onHistorySearchChange: (value: string) => void;
  onFavoriteOnlyChange: Dispatch<SetStateAction<boolean>>;
  onHistoryFiltersOpenChange: Dispatch<SetStateAction<boolean>>;
  onHistoryFilterChange: Dispatch<SetStateAction<HistoryFilter>>;
  onHistoryBatchFilterChange: (value: string) => void;
  onHistoryProjectFilterChange: (value: string) => void;
  onHistoryTagFilterChange: (value: string) => void;
  onResetHistoryFilters: () => void;
  onTopbarMenuOpenChange: Dispatch<SetStateAction<boolean>>;
  onAdminOpen: () => void;
  onChangePasswordOpen: () => void;
  onLocaleChange: Dispatch<SetStateAction<Locale>>;
  onOpenGenerationStudio: () => void;
  onRefreshGallery: () => void;
  onSettingsOpen: () => void;
  onJobMonitorClose: () => void;
  onLogout: () => void;
  onClearHistory: () => void;
};

export function Topbar({
  activeView,
  brandMark,
  siteTitle,
  providerLabel,
  modelLabel,
  catalog,
  currentUser,
  locale,
  historySearch,
  favoriteOnly,
  historyFiltersOpen,
  historyFiltersActive,
  historyFilter,
  historyBatchFilter,
  historyProjectFilter,
  historyTagFilter,
  batches,
  projects,
  allTags,
  topbarMenuOpen,
  historyLoading,
  recordsLength,
  hasHistoryNextCursor,
  runNotice,
  jobMonitor,
  t,
  onHistorySearchChange,
  onFavoriteOnlyChange,
  onHistoryFiltersOpenChange,
  onHistoryFilterChange,
  onHistoryBatchFilterChange,
  onHistoryProjectFilterChange,
  onHistoryTagFilterChange,
  onResetHistoryFilters,
  onTopbarMenuOpenChange,
  onAdminOpen,
  onChangePasswordOpen,
  onLocaleChange,
  onOpenGenerationStudio,
  onRefreshGallery,
  onSettingsOpen,
  onJobMonitorClose,
  onLogout,
  onClearHistory
}: TopbarProps) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand compact">
            {brandMark}
            <div>
              <p className="brand-title">{siteTitle}</p>
              <p className="brand-subtitle">
                {providerLabel} / {modelLabel}
              </p>
            </div>
          </div>
          {activeView === "gallery" && (
            <div className={`topbar-search history-toolbar ${historyFiltersOpen ? "is-open" : ""}`} role="search">
              <label className="history-search-field">
                <Search size={18} />
                <input
                  value={historySearch}
                  onChange={(event) => onHistorySearchChange(event.target.value)}
                  placeholder={locale === "zh" ? "搜索提示词、模型、尺寸..." : "Search prompts, models, sizes..."}
                  aria-label={locale === "zh" ? "搜索历史" : "Search history"}
                />
              </label>
              <button
                className={`icon-button history-favorite-filter ${favoriteOnly ? "is-active" : ""}`}
                type="button"
                title={locale === "zh" ? "只看收藏" : "Show favorites"}
                aria-pressed={favoriteOnly}
                onClick={() => onFavoriteOnlyChange((current) => !current)}
              >
                <Star size={18} fill={favoriteOnly ? "currentColor" : "none"} />
              </button>
              <button
                className={`icon-button history-filter-toggle ${historyFiltersOpen ? "is-active" : ""}`}
                type="button"
                title={locale === "zh" ? "筛选" : "Filters"}
                aria-expanded={historyFiltersOpen}
                onClick={() => onHistoryFiltersOpenChange((current) => !current)}
              >
                <Settings2 size={18} />
              </button>
              {historyFiltersActive && (
                <button
                  className="icon-button history-reset-button"
                  type="button"
                  title={locale === "zh" ? "重置筛选" : "Reset filters"}
                  onClick={onResetHistoryFilters}
                >
                  <X size={17} />
                </button>
              )}
              <div className="history-filter-drawer" hidden={!historyFiltersOpen}>
                <select
                  className="history-filter-select"
                  value={historyFilter.provider}
                  onChange={(event) => onHistoryFilterChange((current) => ({ ...current, provider: event.target.value as HistoryFilter["provider"], model: "all" }))}
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
                  className="history-filter-select"
                  value={historyFilter.model}
                  onChange={(event) => onHistoryFilterChange((current) => ({ ...current, model: event.target.value }))}
                  aria-label={t("model")}
                >
                  <option value="all">{t("allModels")}</option>
                  {catalog?.models
                    .filter((item) => historyFilter.provider === "all" || item.provider === historyFilter.provider)
                    .map((item) => (
                      <option key={`${item.provider}:${item.modelId}`} value={item.modelId}>
                        {item.label}
                      </option>
                    ))}
                </select>
                <select
                  className="history-filter-select"
                  value={historyBatchFilter}
                  onChange={(event) => onHistoryBatchFilterChange(event.target.value)}
                  aria-label={locale === "zh" ? "批次" : "Batch"}
                >
                  <option value="all">{locale === "zh" ? "全部批次" : "All batches"}</option>
                  {batches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  className="history-filter-select"
                  value={historyProjectFilter}
                  onChange={(event) => onHistoryProjectFilterChange(event.target.value)}
                  aria-label={locale === "zh" ? "项目" : "Project"}
                >
                  <option value="all">{locale === "zh" ? "全部项目" : "All projects"}</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  className="history-filter-select"
                  value={historyTagFilter}
                  onChange={(event) => onHistoryTagFilterChange(event.target.value)}
                  list="history-tags"
                  placeholder={locale === "zh" ? "标签" : "Tag"}
                  aria-label={locale === "zh" ? "标签" : "Tag"}
                />
                <datalist id="history-tags">
                  {allTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>
            </div>
          )}
          <div className="toolbar topbar-actions">
            <div className="topbar-action-group topbar-user-actions">
              <span className="icon-button topbar-account-button" title={`${t("account")}: ${currentUser.email}`} aria-label={`${t("account")}: ${currentUser.email}`} role="img">
                <UserCog size={18} />
              </span>
              {currentUser.role === "ADMIN" && (
                <button
                  className="icon-button topbar-admin-button"
                  type="button"
                  title={t("admin")}
                  aria-label={t("admin")}
                  onClick={() => {
                    onTopbarMenuOpenChange(false);
                    onAdminOpen();
                  }}
                >
                  <ShieldCheck size={18} />
                </button>
              )}
              <button
                className="icon-button topbar-language-button"
                type="button"
                title={t("languageTitle")}
                aria-label={t("languageTitle")}
                onClick={() => {
                  onTopbarMenuOpenChange(false);
                  onLocaleChange((current) => current === "zh" ? "en" : "zh");
                }}
              >
                <Languages size={18} />
              </button>
            </div>
            <button
              className="primary-button topbar-create-button"
              data-testid="open-generation-studio"
              type="button"
              title={locale === "zh" ? "生成新图" : "New image"}
              aria-label={locale === "zh" ? "生成新图" : "New image"}
              onClick={() => {
                onTopbarMenuOpenChange(false);
                onJobMonitorClose();
                onOpenGenerationStudio();
              }}
            >
              <ImagePlus size={17} />
              {locale === "zh" ? "生成新图" : "New image"}
            </button>
            <div className="topbar-action-group topbar-tool-actions">
              {activeView === "gallery" && (
                <>
                  <button
                    className="icon-button"
                    data-testid="refresh-gallery"
                    type="button"
                    title={locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"}
                    aria-label={locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"}
                    disabled={historyLoading}
                    onClick={() => {
                      onTopbarMenuOpenChange(false);
                      onRefreshGallery();
                    }}
                  >
                    {historyLoading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                  </button>
                  {jobMonitor}
                </>
              )}
              <button
                className="icon-button"
                type="button"
                title={t("settings")}
                aria-label={t("settings")}
                onClick={() => {
                  onTopbarMenuOpenChange(false);
                  onSettingsOpen();
                }}
              >
                <Settings2 size={18} />
              </button>
              <div className={`topbar-more ${topbarMenuOpen ? "is-open" : ""}`}>
                <button
                  className="icon-button topbar-more-button"
                  data-testid="topbar-more-button"
                  type="button"
                  title={t("moreActions")}
                  aria-label={t("moreActions")}
                  aria-expanded={topbarMenuOpen}
                  onClick={() => {
                    onJobMonitorClose();
                    onTopbarMenuOpenChange((current) => !current);
                  }}
                >
                  <Ellipsis size={18} />
                </button>
                {topbarMenuOpen && (
                  <div className="topbar-menu" role="menu">
                    <div className="topbar-menu-meta">
                      <span>{t("account")}</span>
                      <strong>{currentUser.email}</strong>
                    </div>
                    {currentUser.role === "ADMIN" && (
                      <button
                        className="topbar-menu-item topbar-menu-admin"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onTopbarMenuOpenChange(false);
                          onAdminOpen();
                        }}
                      >
                        <ShieldCheck size={15} />
                        {t("admin")}
                      </button>
                    )}
                    <button
                      className="topbar-menu-item"
                      data-testid="change-password-open"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onTopbarMenuOpenChange(false);
                        onChangePasswordOpen();
                      }}
                    >
                      <LockKeyhole size={15} />
                      {t("changePassword")}
                    </button>
                    <button
                      className="topbar-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onTopbarMenuOpenChange(false);
                        onLogout();
                      }}
                    >
                      <LogOut size={15} />
                      {t("logout")}
                    </button>
                    <button
                      className="topbar-menu-item is-danger"
                      type="button"
                      role="menuitem"
                      disabled={recordsLength === 0 && !hasHistoryNextCursor}
                      onClick={onClearHistory}
                    >
                      <Trash2 size={15} />
                      {t("clearHistory")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {runNotice && (
        <div className="app-toast" role="status">
          <Check size={16} />
          <span>{runNotice}</span>
        </div>
      )}
    </>
  );
}
