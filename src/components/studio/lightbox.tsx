import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Check, Copy, Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { ImageRecord } from "@/lib/types";
import { RawImage } from "./raw-image";

export type LightboxMode = "detail" | "inspect";
export type LightboxPoint = { x: number; y: number };
export type LightboxImageSize = { width: number; height: number };
export type LightboxDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type StudioLightboxLabels = {
  imagePreview: string;
  closePreview: string;
  download: string;
  preview: string;
  promptUsed: string;
  copied: string;
  copyPrompt: string;
  zoomOut: string;
  resetZoom: string;
  zoomIn: string;
};

type StudioLightboxProps = {
  record: ImageRecord;
  mode: LightboxMode;
  isDragging: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  zoomLabel: string;
  inspectorMeta: string;
  scale: number;
  offset: LightboxPoint;
  providerLabel: string;
  modelLabel: string;
  detailLabel: string;
  copiedPrompt: boolean;
  labels: StudioLightboxLabels;
  onClose: () => void;
  onEnterInspector: () => void;
  onLeaveInspector: () => void;
  onResetZoom: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onCopyPrompt: () => void;
  onImageLoad: (image: HTMLImageElement) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function StudioLightbox({
  record,
  mode,
  isDragging,
  stageRef,
  zoomLabel,
  inspectorMeta,
  scale,
  offset,
  providerLabel,
  modelLabel,
  detailLabel,
  copiedPrompt,
  labels,
  onClose,
  onEnterInspector,
  onLeaveInspector,
  onResetZoom,
  onZoomOut,
  onZoomIn,
  onCopyPrompt,
  onImageLoad,
  onPointerDown,
  onPointerMove,
  onPointerEnd
}: StudioLightboxProps) {
  return (
    <div className={`lightbox ${mode === "inspect" ? "is-inspector" : ""}`} role="dialog" aria-modal="true" aria-label={labels.imagePreview}>
      <button className="lightbox-scrim" type="button" aria-label={labels.closePreview} onClick={mode === "inspect" ? onLeaveInspector : onClose} />
      {mode === "inspect" ? (
        <div className={`lightbox-inspector ${isDragging ? "is-dragging" : ""}`} data-testid="lightbox-inspector">
          <div className="lightbox-inspector-toolbar">
            <span className="lightbox-inspector-pill" data-testid="lightbox-zoom-label">{zoomLabel}</span>
            {inspectorMeta && <span className="lightbox-inspector-pill">{inspectorMeta}</span>}
            <div className="lightbox-inspector-actions">
              <button
                className="icon-button"
                type="button"
                title={labels.zoomOut}
                aria-label={labels.zoomOut}
                onClick={onZoomOut}
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                data-testid="lightbox-reset-zoom"
                type="button"
                title={labels.resetZoom}
                aria-label={labels.resetZoom}
                onClick={onResetZoom}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                title={labels.zoomIn}
                aria-label={labels.zoomIn}
                onClick={onZoomIn}
              >
                <Plus size={17} />
              </button>
              <a className="icon-button" data-testid="lightbox-download" title={labels.download} aria-label={labels.download} href={record.imageUrl} download>
                <Download size={17} />
              </a>
              <button className="icon-button" type="button" title={labels.closePreview} aria-label={labels.closePreview} onClick={onLeaveInspector}>
                <X size={18} />
              </button>
            </div>
          </div>
          <div
            className="lightbox-inspector-stage"
            data-testid="lightbox-inspector-stage"
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <RawImage
              data-testid="lightbox-inspector-image"
              src={record.imageUrl}
              alt={labels.imagePreview}
              fetchPriority="high"
              draggable={false}
              onLoad={(event) => onImageLoad(event.currentTarget)}
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`
              }}
            />
          </div>
          <button className="lightbox-inspector-close" data-testid="lightbox-inspector-close" type="button" onClick={onLeaveInspector}>
            <X size={22} />
          </button>
        </div>
      ) : (
        <div className="lightbox-panel" data-testid="lightbox-detail">
          <div className="lightbox-head">
            <div className="result-meta">
              <span className="tag is-provider">{providerLabel}</span>
              <span className="tag">{modelLabel}</span>
              <span className="tag">{detailLabel}</span>
            </div>
            <button className="icon-button" type="button" title={labels.closePreview} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <button className="lightbox-image-wrap lightbox-image-button" data-testid="lightbox-detail-image" type="button" onClick={onEnterInspector} title={labels.preview}>
            <RawImage src={record.imageUrl} alt={labels.imagePreview} fetchPriority="high" onLoad={(event) => onImageLoad(event.currentTarget)} />
          </button>
          <details className="lightbox-prompt" open>
            <summary>
              <span>{labels.promptUsed}</span>
              <button className="text-button tiny" type="button" onClick={onCopyPrompt}>
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? labels.copied : labels.copyPrompt}
              </button>
            </summary>
            <p>{record.prompt}</p>
          </details>
        </div>
      )}
    </div>
  );
}
