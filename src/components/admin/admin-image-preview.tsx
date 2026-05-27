import { X } from "lucide-react";
import type { AdminImageRecord } from "./utils/admin-api";
import { formatAdminDate } from "./utils/admin-format";
import { RawImage } from "@/components/studio/raw-image";

export function AdminImagePreview({
  image,
  onClose
}: {
  image: AdminImageRecord | null;
  onClose: () => void;
}) {
  if (!image) return null;

  return (
    <div className="admin-preview-scrim" role="dialog" aria-modal="true" aria-label="图片预览">
      <div className="admin-preview">
        <button className="admin-icon-button admin-preview-close" type="button" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="admin-preview-stage">
          <RawImage src={image.imageUrl} alt="" />
        </div>
        <aside className="admin-preview-meta">
          <div>
            <span>用户</span>
            <strong>{image.userEmail}</strong>
          </div>
          <div>
            <span>模型</span>
            <strong>{image.provider} / {image.model}</strong>
          </div>
          <div>
            <span>生成时间</span>
            <strong>{formatAdminDate(image.createdAt)}</strong>
          </div>
          <div>
            <span>参数</span>
            <strong>{[image.aspectRatio, image.size, image.quality, image.inputFidelity].filter(Boolean).join(" / ") || "-"}</strong>
          </div>
          <div className="admin-preview-prompt">
            <span>提示词</span>
            <p>{image.prompt}</p>
          </div>
          {image.tags.length > 0 && (
            <div className="admin-tag-row">
              {image.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
