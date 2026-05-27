import { RotateCcw } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import type { AdminImageFilters, AdminImageRecord } from "./utils/admin-api";
import { AdminSection, EmptyState } from "./admin-layout";
import { formatAdminDate } from "./utils/admin-format";
import { RawImage } from "@/components/studio/raw-image";

export function AdminImages({
  images,
  users,
  filters,
  nextCursor,
  busy,
  onFiltersChange,
  onResetFilters,
  onLoadMore,
  onOpenPreview
}: {
  images: AdminImageRecord[];
  users: PublicUser[];
  filters: AdminImageFilters;
  nextCursor?: string;
  busy: string;
  onFiltersChange: (next: Partial<AdminImageFilters>) => void;
  onResetFilters: () => void;
  onLoadMore: () => void;
  onOpenPreview: (image: AdminImageRecord) => void;
}) {
  const providerOptions = Array.from(new Set(images.map((image) => image.provider))).sort();
  const modelOptions = Array.from(new Set(images.map((image) => image.model))).sort();

  return (
    <div className="admin-page-stack" data-testid="admin-images">
      <AdminSection
        title="图片筛选"
        description="全平台生成图片只读审查，V1 不提供删除和批量操作。"
        actions={(
          <button className="admin-icon-text-button" type="button" onClick={onResetFilters}>
            <RotateCcw size={16} />
            重置
          </button>
        )}
      >
        <div className="admin-filter-bar admin-image-filter-bar">
          <label className="admin-field">
            <span>用户</span>
            <select value={filters.userId} onChange={(event) => onFiltersChange({ userId: event.target.value })}>
              <option value="">全部用户</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
            </select>
          </label>
          <label className="admin-field">
            <span>供应商</span>
            <input value={filters.provider} list="admin-image-providers" placeholder="openai" onChange={(event) => onFiltersChange({ provider: event.target.value })} />
            <datalist id="admin-image-providers">
              {providerOptions.map((provider) => <option key={provider} value={provider} />)}
            </datalist>
          </label>
          <label className="admin-field">
            <span>模型</span>
            <input value={filters.model} list="admin-image-models" placeholder="gpt-image-2" onChange={(event) => onFiltersChange({ model: event.target.value })} />
            <datalist id="admin-image-models">
              {modelOptions.map((model) => <option key={model} value={model} />)}
            </datalist>
          </label>
          <label className="admin-field">
            <span>开始日期</span>
            <input type="date" value={filters.dateFrom} onChange={(event) => onFiltersChange({ dateFrom: event.target.value })} />
          </label>
          <label className="admin-field">
            <span>结束日期</span>
            <input type="date" value={filters.dateTo} onChange={(event) => onFiltersChange({ dateTo: event.target.value })} />
          </label>
          <label className="admin-field admin-filter-query">
            <span>关键词</span>
            <input value={filters.q} placeholder="提示词 / 邮箱 / 模型" onChange={(event) => onFiltersChange({ q: event.target.value })} />
          </label>
        </div>
      </AdminSection>

      <AdminSection title="图片列表" description="点击图片打开预览并查看提示词与参数。">
        {images.length === 0 ? (
          <EmptyState>{busy ? "正在加载图片。" : "没有匹配图片。"}</EmptyState>
        ) : (
          <>
            <div className="admin-image-grid admin-review-grid">
              {images.map((image) => (
                <button className="admin-image-card" type="button" key={image.id} onClick={() => onOpenPreview(image)}>
                  <span className="admin-image-thumb">
                    <RawImage src={image.thumbnailUrl} alt="" loading="lazy" />
                  </span>
                  <span className="admin-image-card-body">
                    <strong>{image.userEmail}</strong>
                    <small>{image.model}</small>
                    <span>{formatAdminDate(image.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
            {nextCursor && (
              <div className="admin-load-more">
                <button className="admin-icon-text-button" type="button" onClick={onLoadMore} disabled={Boolean(busy)}>
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </AdminSection>
    </div>
  );
}
