import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { describeError } from "../data/api";
import {
  addSavedMemory,
  reloadSavedMemories,
  removeSavedMemory,
  updateSavedMemory,
  useMemoriesState,
  type SavedMemoryCard,
} from "../data/memoryStore";
import { updatePersonPhoto, type Person } from "../data/people";
import DataNotice from "./DataNotice";
import {
  CheckIcon,
  CloseIcon,
  CropIcon,
  DownloadIcon,
  FlipIcon,
  PencilIcon,
  PlusIcon,
  RotateIcon,
  TrashIcon,
} from "./icons";

/** A rectangle in percentages of the picture it sits over. */
type Rect = { x: number; y: number; w: number; h: number };

/** Everything the editor can do to a photograph. */
type Edit = {
  rotation: number; // 0, 90, 180 or 270
  flipH: boolean;
  preset: string;
  brightness: number;
  contrast: number;
  saturate: number;
  crop: Rect | null;
};

const PRESETS: { id: string; label: string; css: string }[] = [
  { id: "original", label: "Original", css: "" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.35)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(12deg)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.7) contrast(1.08)" },
  { id: "soft", label: "Soft", css: "brightness(1.06) contrast(0.9) saturate(0.92)" },
  { id: "mono", label: "Black & white", css: "grayscale(1)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.75)" },
];

const ASPECTS: { id: string; label: string; value: number | null }[] = [
  { id: "free", label: "Free", value: null },
  { id: "square", label: "Square", value: 1 },
  { id: "wide", label: "Wide", value: 16 / 9 },
  { id: "tall", label: "Tall", value: 4 / 5 },
];

function blankEdit(): Edit {
  return {
    rotation: 0,
    flipH: false,
    preset: "original",
    brightness: 100,
    contrast: 100,
    saturate: 100,
    crop: null,
  };
}

/** The exact filter string the preview shows and the canvas bakes in. */
function cssFilter(edit: Edit): string {
  const preset = PRESETS.find((p) => p.id === edit.preset)?.css ?? "";
  return [
    preset,
    `brightness(${edit.brightness}%)`,
    `contrast(${edit.contrast}%)`,
    `saturate(${edit.saturate}%)`,
  ]
    .filter(Boolean)
    .join(" ");
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That photograph couldn't be opened."));
    img.src = src;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That photograph couldn't be read."));
    reader.onerror = () => reject(new Error("That photograph couldn't be read."));
    reader.readAsDataURL(file);
  });
}

/** Rotation, flip and filter, applied to the whole picture. */
function compose(img: HTMLImageElement, edit: Edit): HTMLCanvasElement {
  const rotation = ((edit.rotation % 360) + 360) % 360;
  const swap = rotation === 90 || rotation === 270;
  const width = swap ? img.naturalHeight : img.naturalWidth;
  const height = swap ? img.naturalWidth : img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't edit photographs.");

  // JPEG has no transparency — white behind the corners a rotation leaves.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  const filter = cssFilter(edit);
  if (filter) ctx.filter = filter;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  if (edit.flipH) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  return canvas;
}

/** Cuts the rectangle out of an already-composed picture. */
function cropCanvas(source: HTMLCanvasElement, crop: Rect): HTMLCanvasElement {
  const sx = Math.round((crop.x / 100) * source.width);
  const sy = Math.round((crop.y / 100) * source.height);
  const sw = Math.max(1, Math.round((crop.w / 100) * source.width));
  const sh = Math.max(1, Math.round((crop.h / 100) * source.height));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't edit photographs.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* ------------------------------------------------------------------ */
/* The dialog every part of the gallery opens inside                   */
/* ------------------------------------------------------------------ */

function Modal({
  label,
  onClose,
  size = "md",
  children,
}: {
  label: string;
  onClose: () => void;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Remember what opened the dialog so focus goes back on close.
  useEffect(() => {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      lastTriggerRef.current?.focus();
    };
  }, []);

  // Close on Escape; trap Tab inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-md sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`animate-lightbox-in w-full overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border ${
          size === "lg" ? "max-w-3xl" : "max-w-xl"
        }`}
        style={{ maxHeight: "min(92vh, 880px)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 sm:px-6">
          <p className="truncate font-heading text-xl text-ink">{label}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 px-3 py-1.5"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div
          className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
          style={{ maxHeight: "calc(min(92vh, 880px) - 66px)" }}
        >
          {children}
        </div>
      </div>
    </div>,
    // Portal to <body> so the backdrop covers the viewport (see Lightbox).
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* The editor: crop, rotate, flip, filters, brightness                 */
/* ------------------------------------------------------------------ */

const PREVIEW_MAX_W = 860;
const PREVIEW_MAX_H = 460;

function PhotoEditor({
  memory,
  onClose,
  onSaved,
}: {
  memory: SavedMemoryCard;
  onClose: () => void;
  /** Hands the new picture back so the circle can follow it. */
  onSaved: (dataUrl: string, previousDataUrl: string | null) => void;
}) {
  const src = memory.photoDataUrl ?? "";
  // The picture as it was before this edit — what the circle may be showing.
  const previousRef = useRef<string | null>(memory.photoDataUrl ?? null);
  const [edit, setEdit] = useState<Edit>(blankEdit);
  const [cropping, setCropping] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; bw: number; bh: number } | null>(null);
  const cropBeforeRef = useRef<Rect | null>(null);

  /** Redraws the preview from the current edit — the same maths as saving. */
  function redraw() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    try {
      const composed = compose(img, edit);
      const shown = !cropping && edit.crop ? cropCanvas(composed, edit.crop) : composed;
      const scale = Math.min(
        1,
        PREVIEW_MAX_W / shown.width,
        PREVIEW_MAX_H / shown.height
      );
      canvas.width = Math.max(1, Math.round(shown.width * scale));
      canvas.height = Math.max(1, Math.round(shown.height * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(shown, 0, 0, canvas.width, canvas.height);
    } catch {
      /* the error surfaces through the notice below */
    }
  }

  // Load the picture once, then redraw on every change.
  useEffect(() => {
    let cancelled = false;
    imgRef.current = null;
    loadImage(src)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        redraw();
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, cropping]);

  function pointerPct(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
      bw: rect.width,
      bh: rect.height,
    };
  }

  function startCrop(e: ReactPointerEvent<HTMLDivElement>) {
    if (!cropping) return;
    const p = pointerPct(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: p.x, y: p.y, bw: p.bw, bh: p.bh };
    setEdit((prev) => ({ ...prev, crop: { x: p.x, y: p.y, w: 0, h: 0 } }));
  }

  function moveCrop(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!cropping || !drag) return;
    const p = pointerPct(e);

    let x0 = Math.min(drag.x, p.x);
    let x1 = Math.max(drag.x, p.x);
    let y0 = Math.min(drag.y, p.y);
    let y1 = Math.max(drag.y, p.y);

    if (aspect) {
      // Hold the shape: height comes from width and the box's own proportions.
      const width = x1 - x0;
      const height = (width * (drag.bw / drag.bh)) / aspect;
      if (height > 100) return;
      if (p.y < drag.y) {
        y1 = clamp(y1);
        y0 = y1 - height;
        if (y0 < 0) {
          y0 = 0;
          y1 = height;
        }
      } else {
        y0 = clamp(y0, 0, 100 - height);
        y1 = y0 + height;
      }
    }

    setEdit((prev) => ({
      ...prev,
      crop: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    }));
  }

  function endCrop() {
    dragRef.current = null;
    setEdit((prev) => {
      if (prev.crop && (prev.crop.w < 3 || prev.crop.h < 3)) {
        return { ...prev, crop: cropBeforeRef.current };
      }
      return prev;
    });
  }

  function beginCrop() {
    cropBeforeRef.current = edit.crop;
    setCropping(true);
  }

  function cancelCrop() {
    setEdit((prev) => ({ ...prev, crop: cropBeforeRef.current }));
    setCropping(false);
  }

  function turnQuarter() {
    setEdit((prev) => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360,
      crop: null, // the rectangle no longer lines up with the picture
    }));
    setCropping(false);
  }

  function flip() {
    setEdit((prev) => ({ ...prev, flipH: !prev.flipH, crop: null }));
    setCropping(false);
  }

  async function save() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    setError(null);
    try {
      const composed = compose(img, edit);
      const out = edit.crop ? cropCanvas(composed, edit.crop) : composed;
      const dataUrl = out.toDataURL("image/jpeg", 0.85);
      await updateSavedMemory(memory.id, { photoDataUrl: dataUrl });
      onSaved(dataUrl, previousRef.current);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const unchanged = JSON.stringify(edit) === JSON.stringify(blankEdit());

  return (
    <Modal label="Edit photo" onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <div
          ref={boxRef}
          className="relative mx-auto w-full touch-none overflow-hidden rounded-2xl bg-black/5"
          style={{ cursor: cropping ? "crosshair" : "default" }}
          onPointerDown={startCrop}
          onPointerMove={moveCrop}
          onPointerUp={endCrop}
          onPointerCancel={endCrop}
        >
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label="The photograph you are editing"
          />
          {cropping && edit.crop && (
            <div
              className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                left: `${edit.crop.x}%`,
                top: `${edit.crop.y}%`,
                width: `${edit.crop.w}%`,
                height: `${edit.crop.h}%`,
              }}
            />
          )}
        </div>

        {cropping && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-soft">Shape</span>
            {ASPECTS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setAspect(option.value);
                  setEdit((prev) => {
                    if (!prev.crop || !option.value) return prev;
                    // Re-cut the existing rectangle to the shape chosen.
                    const height =
                      (prev.crop.w * (boxRef.current?.clientWidth || 1)) /
                      (option.value * (boxRef.current?.clientHeight || 1));
                    if (height > 100) return prev;
                    return {
                      ...prev,
                      crop: { ...prev.crop, y: clamp(prev.crop.y), h: height },
                    };
                  });
                }}
                className={`chip cursor-pointer ${
                  aspect === option.value ? "ring-2 ring-terracotta" : ""
                }`}
                aria-pressed={aspect === option.value}
              >
                {option.label}
              </button>
            ))}
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={cancelCrop}
              >
                Cancel crop
              </button>
              <button
                type="button"
                className="btn-primary px-5 py-2 text-base"
                onClick={() => setCropping(false)}
                disabled={!edit.crop || edit.crop.w < 3 || edit.crop.h < 3}
              >
                <CheckIcon className="h-5 w-5" />
                Keep this crop
              </button>
            </span>
          </div>
        )}

        {!cropping && (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={beginCrop}>
                <CropIcon className="h-5 w-5" />
                Crop
              </button>
              <button type="button" className="btn-ghost" onClick={turnQuarter}>
                <RotateIcon className="h-5 w-5" />
                Rotate
              </button>
              <button type="button" className="btn-ghost" onClick={flip}>
                <FlipIcon className="h-5 w-5" />
                Mirror
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-soft">Filter</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`chip cursor-pointer ${
                    edit.preset === preset.id ? "ring-2 ring-terracotta" : ""
                  }`}
                  onClick={() => setEdit((prev) => ({ ...prev, preset: preset.id }))}
                  aria-pressed={edit.preset === preset.id}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["Brightness", "brightness"],
                  ["Contrast", "contrast"],
                  ["Colour", "saturate"],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="block text-sm font-semibold text-ink-soft">
                  {label}
                  <input
                    type="range"
                    min={key === "saturate" ? 0 : 50}
                    max={key === "saturate" ? 200 : 150}
                    value={edit[key]}
                    onChange={(e) =>
                      setEdit((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="mt-1 w-full accent-terracotta"
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-2xl border border-ochre bg-ochre-soft p-3 text-base text-ink">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void save()}
            disabled={saving || unchanged || cropping}
          >
            <CheckIcon className="h-5 w-5" />
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setEdit(blankEdit());
              setCropping(false);
              setAspect(null);
            }}
            disabled={unchanged}
          >
            Start over
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {cropping && (
          <p className="text-sm text-ink-soft">
            Drag over the picture to choose what to keep.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The gallery itself                                                  */
/* ------------------------------------------------------------------ */

export default function PhotoGallery({
  people,
  onOpenPerson,
  onAddToPeople,
  scope = "faces",
  heading = "Your photo gallery",
  blurb =
    "Every photo you've kept, wherever you saved it. Tap one to see it big — then edit it, crop it, try a filter, save it to your device or take it away. A photo of someone in your circle becomes their picture in the circle.",
  showAddTile = true,
}: {
  /** The circle. Leave it out on screens where the circle is not the point. */
  people?: Person[];
  onOpenPerson?: (p: Person) => void;
  /** Offers the photo's person a place in the circle via the Add form. */
  onAddToPeople?: (memory: SavedMemoryCard) => void;
  /** "faces" keeps the photos saved to this page; "all" is every photo kept. */
  scope?: "faces" | "all";
  heading?: string;
  blurb?: string;
  /** The dashed "Add a photo" tile — off where adding is the screen's own job. */
  showAddTile?: boolean;
}) {
  const memoriesState = useMemoriesState();
  const saved = memoriesState.data.filter((m) =>
    scope === "all"
      ? Boolean(m.photoDataUrl)
      : m.destinations.includes("faces") && Boolean(m.photoDataUrl)
  );

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  // Each photograph is offered to the circle once, so a save the server
  // refuses is not asked for again on every render.
  const triedRef = useRef<Set<string>>(new Set());

  const matchFor = (m: SavedMemoryCard) =>
    people?.find(
      (p) => p.name.trim().toLowerCase() === (m.name || "").trim().toLowerCase()
    );

  // A kept photograph of someone in the circle becomes their picture in the
  // circle — the face you saved is the face you see up there. Only for people
  // who do not have one yet, so a photo chosen by hand is never replaced.
  useEffect(() => {
    if (!people) return;
    for (const m of saved) {
      const name = (m.name || "").trim().toLowerCase();
      if (!m.photoDataUrl || !name || triedRef.current.has(m.id)) continue;
      const match = people.find((p) => p.name.trim().toLowerCase() === name);
      if (!match || match.photoDataUrl) continue;
      triedRef.current.add(m.id);
      void updatePersonPhoto(match.id, m.photoDataUrl).catch(() => {
        // The circle keeps its initials; the buttons still offer it by hand.
      });
    }
  }, [saved, people]);

  const viewer = saved.find((m) => m.id === viewerId) ?? null;
  const editing = saved.find((m) => m.id === editorId) ?? null;
  const removing = saved.find((m) => m.id === removingId) ?? null;

  if (memoriesState.status === "error") {
    return (
      <DataNotice
        state={memoriesState}
        onRetry={reloadSavedMemories}
        className="mt-9"
      />
    );
  }

  /** Puts this photograph on the person's button in the circle. */
  async function useAsCirclePhoto(p: Person, m: SavedMemoryCard) {
    if (!m.photoDataUrl) return;
    setBusyId(m.id);
    try {
      await updatePersonPhoto(p.id, m.photoDataUrl);
      setStatus(`That photograph is now ${p.name}'s picture in the circle.`);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  /** Adds a picture straight from the device, kept to this page. */
  async function addFromFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const photoDataUrl = await readAsDataURL(file);
      await addSavedMemory({
        name: "",
        metNote: "",
        caption: `A new memory · ${shortDate(new Date())}`,
        photoDataUrl,
        destinations: ["faces"],
      });
      setStatus("Added to your gallery — tap it to edit.");
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }

  /** The editor finished: keep the circle's copy in step, if it is this one. */
  function edited(m: SavedMemoryCard, dataUrl: string, previousDataUrl: string | null) {
    const match = matchFor(m);
    if (match && previousDataUrl && match.photoDataUrl === previousDataUrl) {
      void updatePersonPhoto(match.id, dataUrl).catch(() => undefined);
    }
    setStatus("That photo has been saved.");
    setError(null);
  }

  async function confirmRemove(m: SavedMemoryCard) {
    setBusyId(m.id);
    try {
      await removeSavedMemory(m.id);
      setStatus("That photo has been removed.");
      setError(null);
      setRemovingId(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  function download(m: SavedMemoryCard) {
    if (!m.photoDataUrl) return;
    const link = document.createElement("a");
    link.href = m.photoDataUrl;
    link.download = `${(m.name || "memory-lane-photo").replace(/[^\w-]+/g, "-").toLowerCase()}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const viewerMatch = viewer ? matchFor(viewer) : null;

  return (
    <section className="mt-9" aria-labelledby="saved-photos-heading">
      <h2 id="saved-photos-heading" className="font-heading text-2xl text-ink">
        {heading}
      </h2>
      <p className="mt-1 text-ink-soft">{blurb}</p>

      {status && (
        <p
          role="status"
          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-sage px-4 py-2 text-base font-semibold text-ink"
        >
          <CheckIcon className="h-4 w-4 text-ochre-deep" aria-hidden="true" />
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 block rounded-2xl border border-ochre bg-ochre-soft p-4 text-base text-ink"
        >
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void addFromFile(e)}
        aria-label="Add a photo from your device"
      />

      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {saved.map((m) => {
          const match = matchFor(m);
          const busy = busyId === m.id;
          return (
            <li key={m.id} className="rounded-2xl">
              <button
                type="button"
                onClick={() => setViewerId(m.id)}
                className="group relative block w-full overflow-hidden rounded-2xl text-left"
                aria-label={`Open ${m.name || "this photo"} up close`}
              >
                <img
                  src={m.photoDataUrl ?? undefined}
                  alt={m.caption}
                  className="aspect-square w-full rounded-2xl object-cover shadow-sm ring-1 ring-border transition-shadow group-hover:shadow-md"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 hidden items-center justify-center rounded-2xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:flex"
                >
                  <PencilIcon className="h-7 w-7 text-white/95" />
                </span>
              </button>

              <p className="mt-2 block text-base font-bold leading-tight text-ink">
                {m.name || "A saved photo"}
              </p>
              <p className="block text-sm leading-tight text-ink-soft">{m.caption}</p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm"
                  onClick={() => setEditorId(m.id)}
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm"
                  onClick={() => setRemovingId(m.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              </div>

              {match ? (
                match.photoDataUrl === m.photoDataUrl ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ochre-deep">
                    <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    On {match.name}'s button
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost mt-2 w-full justify-center text-sm"
                    onClick={() => void useAsCirclePhoto(match, m)}
                    disabled={busy}
                    aria-label={`Use this photograph as ${match.name}'s picture in the circle`}
                  >
                    Use as {match.name}'s photo
                  </button>
                )
              ) : (
                onAddToPeople && (
                  <button
                    type="button"
                    className="btn-ghost mt-2 w-full justify-center text-sm"
                    onClick={() => onAddToPeople(m)}
                    aria-label={`Add ${m.name || "the person in this photo"} to your circle`}
                  >
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    Add to people
                  </button>
                )
              )}
            </li>
          );
        })}

        {/* Filling the empty corner: a photo can be kept from here too. */}
        {showAddTile && (
          <li className="rounded-2xl">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sand-deep bg-sand text-ink-soft transition-colors hover:border-terracotta/60 hover:text-terracotta"
              aria-label="Add a photo from your device"
            >
              <PlusIcon className="h-8 w-8" />
              <span className="text-sm font-semibold">Add a photo</span>
            </button>
            <p className="mt-2 block text-sm leading-tight text-ink-soft">
              From your device, kept to this page
            </p>
          </li>
        )}
      </ul>

      {saved.length === 0 && memoriesState.status === "ready" && (
        <p className="mt-4 text-ink-soft">
          {scope === "all"
            ? "Nothing here yet — take a photo, or add one from your device, and it will appear here."
            : "Nothing here yet — add a photo of someone in your circle and it will appear in the gallery, and on their button."}
        </p>
      )}

      {viewer && (
        <Modal label={viewer.name || "A saved photo"} onClose={() => setViewerId(null)} size="lg">
          <div className="flex flex-col gap-4">
            <div className="flex justify-center rounded-2xl bg-black/5 p-3">
              <img
                src={viewer.photoDataUrl ?? undefined}
                alt={viewer.caption}
                className="max-h-[46vh] w-auto max-w-full rounded-xl object-contain shadow-md"
              />
            </div>
            <div>
              <p className="text-base text-ink-soft">{viewer.caption}</p>
              {viewer.metNote && (
                <p className="mt-1 text-sm text-ink-soft">{viewer.metNote}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditorId(viewer.id);
                  setViewerId(null);
                }}
              >
                <PencilIcon className="h-5 w-5" />
                Edit photo
              </button>

              {viewerMatch ? (
                viewerMatch.photoDataUrl === viewer.photoDataUrl ? (
                  <p className="btn-ghost cursor-default justify-center opacity-80">
                    <CheckIcon className="h-5 w-5" />
                    On {viewerMatch.name}'s button
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void useAsCirclePhoto(viewerMatch, viewer);
                      setViewerId(null);
                    }}
                  >
                    Use as {viewerMatch.name}'s photo
                  </button>
                )
              ) : onAddToPeople ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onAddToPeople(viewer);
                    setViewerId(null);
                  }}
                >
                  <PlusIcon className="h-5 w-5" />
                  Add to people
                </button>
              ) : (
                <span />
              )}

              <button type="button" className="btn-ghost" onClick={() => download(viewer)}>
                <DownloadIcon className="h-5 w-5" />
                Save to device
              </button>

              {viewerMatch && onOpenPerson && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    onOpenPerson(viewerMatch);
                    setViewerId(null);
                  }}
                >
                  Open {viewerMatch.name}'s page
                </button>
              )}

              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setRemovingId(viewer.id);
                  setViewerId(null);
                }}
              >
                <TrashIcon className="h-5 w-5" />
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && editing.photoDataUrl && (
        <PhotoEditor
          key={editing.id}
          memory={editing}
          onClose={() => setEditorId(null)}
          onSaved={(dataUrl, previousDataUrl) =>
            edited(editing, dataUrl, previousDataUrl)
          }
        />
      )}

      {removing && (
        <Modal label="Remove this photo?" onClose={() => setRemovingId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <img
                src={removing.photoDataUrl ?? undefined}
                alt=""
                className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-border"
              />
              <p className="text-base text-ink-soft">
                <span className="font-bold text-ink">{removing.name || "This photo"}</span>{" "}
                will be taken out of your gallery. It cannot be put back.
              </p>
            </div>
            {error && (
              <p role="alert" className="rounded-2xl border border-ochre bg-ochre-soft p-3 text-base text-ink">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--color-destructive)" }}
                onClick={() => void confirmRemove(removing)}
                disabled={busyId === removing.id}
              >
                <TrashIcon className="h-5 w-5" />
                {busyId === removing.id ? "Removing…" : "Remove photo"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setRemovingId(null)}>
                Keep it
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
