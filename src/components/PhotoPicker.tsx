import { useRef, type ChangeEvent } from "react";
import { shrinkToDataUrl as shrink } from "../data/photoFile";
import { ImageIcon, PlusIcon } from "./icons";

/**
 * The "pick a picture from your files" row, shared by the person card's edit
 * option and the add-a-face form so both look and behave the same way.
 * The file is shrunk before it leaves the device (see data/photoFile).
 */
export default function PhotoPicker({
  photo,
  gradient,
  initials,
  onChange,
  onError,
}: {
  /** The photo chosen so far, or null for the drawn stand-in. */
  photo: string | null;
  /** Shown behind the preview when there is no photo yet (drawn stand-ins only). */
  gradient?: string;
  /** Shown on the stand-in when there is no photo yet (drawn stand-ins only). */
  initials?: string;
  /** Receives the chosen photo, or null when it is taken away. */
  onChange: (photo: string | null) => void;
  /** Receives a message when the chosen file cannot be used. */
  onError?: (message: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  /** Reads a chosen file, shrinks it, and hands it back. */
  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError?.("That file is not a picture — choose a photo instead.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      onError?.("That photo is too large — try one smaller than 20 MB.");
      return;
    }
    shrink(file)
      .then((dataUrl) => {
        onError?.(null);
        onChange(dataUrl);
      })
      .catch(() => onError?.("That photo couldn't be opened — please try another one."));
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-sand p-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a photo from your files"
        onChange={handleFile}
      />

      <span
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand-deep/50 text-ink-soft ring-1 ring-border"
        style={photo || !gradient ? undefined : { background: gradient }}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : gradient && initials ? (
          <span className="font-heading text-lg text-white/95">{initials}</span>
        ) : (
          <ImageIcon className="h-6 w-6" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          {photo ? "This picture will be used." : "No photograph yet."}
        </p>
        <p className="text-sm text-ink-soft">
          {photo
            ? "Pick another to change it."
            : "Pick one from your files to go with it."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="btn-secondary shrink-0"
      >
        <PlusIcon className="h-5 w-5" />
        {photo ? "Change" : "Choose file"}
      </button>

      {photo && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="btn-ghost shrink-0"
        >
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          Remove
        </button>
      )}
    </div>
  );
}
