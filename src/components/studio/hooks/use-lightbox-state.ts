import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ImageRecord } from "@/lib/types";
import type { LightboxDragState, LightboxImageSize, LightboxMode, LightboxPoint } from "../lightbox";

const LIGHTBOX_MIN_SCALE = 0.25;
const LIGHTBOX_MAX_SCALE = 5;
const LIGHTBOX_WHEEL_ZOOM_IN = 1.12;
const LIGHTBOX_WHEEL_ZOOM_OUT = 0.88;

function clampLightboxScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(LIGHTBOX_MAX_SCALE, Math.max(LIGHTBOX_MIN_SCALE, value));
}

function getLightboxZoomLabel(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

function formatFileBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function useLightboxState(records: ImageRecord[]) {
  const [recordId, setRecordId] = useState("");
  const [mode, setMode] = useState<LightboxMode>("detail");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<LightboxPoint>({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<LightboxImageSize>({ width: 0, height: 0 });
  const [fileBytes, setFileBytes] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<LightboxDragState | null>(null);

  const record = useMemo(
    () => records.find((item) => item.id === recordId),
    [recordId, records]
  );
  const zoomLabel = getLightboxZoomLabel(scale);
  const dimensionLabel = naturalSize.width > 0 && naturalSize.height > 0
    ? `${naturalSize.width} x ${naturalSize.height}`
    : "";
  const inspectorMeta = [formatFileBytes(fileBytes), dimensionLabel].filter(Boolean).join(" - ");

  function resetTransform() {
    dragRef.current = null;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
  }

  function open(nextRecordId: string) {
    setRecordId(nextRecordId);
    setMode("detail");
    setNaturalSize({ width: 0, height: 0 });
    setFileBytes(null);
    resetTransform();
  }

  function close() {
    setRecordId("");
    setMode("detail");
    setNaturalSize({ width: 0, height: 0 });
    setFileBytes(null);
    resetTransform();
  }

  function enterInspector() {
    setMode("inspect");
    resetTransform();
  }

  function leaveInspector() {
    setMode("detail");
    resetTransform();
  }

  function handleImageLoad(image: HTMLImageElement) {
    setNaturalSize({
      width: image.naturalWidth,
      height: image.naturalHeight
    });
  }

  function updateScale(nextValue: number, anchor?: LightboxPoint) {
    const currentScale = scale || 1;
    const nextScale = clampLightboxScale(nextValue);
    if (nextScale === currentScale) return;

    setScale(nextScale);
    if (anchor) {
      const factor = nextScale / currentScale;
      setOffset((current) => ({
        x: anchor.x - (anchor.x - current.x) * factor,
        y: anchor.y - (anchor.y - current.y) * factor
      }));
    } else if (nextScale <= 1) {
      setOffset({ x: 0, y: 0 });
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "inspect" || scale <= 1 || event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (mode !== "inspect" || !stage) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = stage.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      };
      const factor = event.deltaY < 0 ? LIGHTBOX_WHEEL_ZOOM_IN : LIGHTBOX_WHEEL_ZOOM_OUT;
      const currentScale = scale || 1;
      const nextScale = clampLightboxScale(currentScale * factor);
      if (nextScale === currentScale) return;

      setScale(nextScale);
      const offsetFactor = nextScale / currentScale;
      setOffset((current) => ({
        x: anchor.x - (anchor.x - current.x) * offsetFactor,
        y: anchor.y - (anchor.y - current.y) * offsetFactor
      }));
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [mode, scale]);

  useEffect(() => {
    if (!record) {
      setFileBytes(null);
      setNaturalSize({ width: 0, height: 0 });
      return;
    }

    let cancelled = false;
    setFileBytes(null);

    void fetch(record.imageUrl, { method: "HEAD" })
      .then((response) => {
        if (cancelled || !response.ok) return;

        const contentLength = response.headers.get("content-length");
        const bytes = contentLength ? Number(contentLength) : Number.NaN;
        if (Number.isFinite(bytes) && bytes > 0) {
          setFileBytes(bytes);
        }
      })
      .catch(() => {
        // File size is only a viewer enhancement; ignore metadata failures.
      });

    return () => {
      cancelled = true;
    };
  }, [record]);

  useEffect(() => {
    if (!recordId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      resetTransform();

      if (mode === "inspect") {
        setMode("detail");
        return;
      }

      setRecordId("");
      setMode("detail");
      setFileBytes(null);
      setNaturalSize({ width: 0, height: 0 });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mode, recordId]);

  return {
    recordId,
    record,
    mode,
    scale,
    offset,
    dragging,
    stageRef,
    zoomLabel,
    inspectorMeta,
    open,
    close,
    resetTransform,
    enterInspector,
    leaveInspector,
    handleImageLoad,
    updateScale,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd
  };
}
