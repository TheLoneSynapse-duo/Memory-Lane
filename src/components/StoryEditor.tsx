import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { describeError } from "../data/api";
import {
  addStory,
  reloadStories,
  removeStory,
  SCENE_ORDER,
  SCENE_WASHES,
  updateStory,
  useStoriesState,
  type Story,
  type StoryInput,
  type StoryScene,
} from "../data/stories";
import { shrinkToDataUrl } from "../data/photoFile";
import SceneArt from "./SceneArt";
import { CheckIcon, CloseIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/70 shadow-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const iconBtnClass =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-ink-soft ring-1 ring-border transition-colors duration-150 hover:bg-sand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-95";

/**
 * A calm, full-screen dialog for adding to — or rewriting — the photo stories.
 * It mirrors ScheduleEditor so the two screens behave the same way.
 */
export default function StoryEditor({ onClose }: { onClose: () => void }) {
  const storiesState = useStoriesState();
  const stories = storiesState.data;

  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // Remember what opened the dialog; lock scroll; focus the close button.
  useEffect(() => {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      lastTriggerRef.current?.focus();
    };
  }, []);

  // Close on Escape; trap Tab inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function startAdding() {
    setEditing({ id: "new" });
    setConfirmRemoveId(null);
    setError(null);
  }

  function startEditing(story: Story) {
    setEditing({ id: story.id });
    setConfirmRemoveId(null);
    setError(null);
  }

  async function handleSave(input: StoryInput) {
    setSaving(true);
    setError(null);
    try {
      if (editing && editing.id !== "new") {
        await updateStory(editing.id, input);
      } else {
        await addStory(input);
      }
      setSaved(true);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 2600);
      setEditing(null);
      closeRef.current?.focus();
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  function askRemove(id: string) {
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveId(id);
    confirmTimerRef.current = window.setTimeout(() => setConfirmRemoveId(null), 4000);
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await removeStory(id);
    } catch (removeError) {
      setError(describeError(removeError));
    }
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveId(null);
  }

  const editingStory =
    editing && editing.id !== "new"
      ? stories.find((story) => story.id === editing.id)
      : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-md sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add or edit stories"
        className="animate-lightbox-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 sm:px-6">
          <h2 className="truncate font-heading text-xl text-ink">Your stories</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 px-3 py-1.5"
            aria-label="Close story editor"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {saved && (
            <p
              role="status"
              className="animate-fade-up flex items-center gap-2 rounded-2xl bg-sage px-4 py-3 font-semibold text-ink"
            >
              <CheckIcon className="h-5 w-5 shrink-0 text-ochre-deep" aria-hidden="true" />
              Saved — your shelf is up to date.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-2xl border border-ochre bg-ochre-soft px-4 py-3 text-ink"
            >
              {error}
            </p>
          )}

          {storiesState.status !== "ready" ? (
            <p role="status" className="mt-3 text-lg text-ink-soft">
              {storiesState.status === "error"
                ? storiesState.error
                : "Looking up your stories…"}
              {storiesState.status === "error" && (
                <button
                  type="button"
                  onClick={() => void reloadStories()}
                  className="btn-secondary mt-4 block"
                >
                  Try again
                </button>
              )}
            </p>
          ) : editing ? (
            <StoryForm
              key={editing.id}
              initial={editingStory}
              saving={saving}
              onSave={handleSave}
              onCancel={() => {
                setEditing(null);
                closeRef.current?.focus();
              }}
            />
          ) : stories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-sand px-5 py-10 text-center">
              <p className="font-heading text-xl text-ink">No stories on the shelf</p>
              <p className="mt-1 text-lg text-ink-soft">
                Write one down before it slips away.
              </p>
              <button type="button" onClick={startAdding} className="btn-primary mt-5">
                <PlusIcon className="h-5 w-5" />
                Add a story
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">
                  {stories.length} {stories.length === 1 ? "story" : "stories"} on the shelf
                </p>
                <button type="button" onClick={startAdding} className="btn-ghost">
                  <PlusIcon className="h-5 w-5" />
                  Add story
                </button>
              </div>
              <ul className="mt-3 space-y-3">
                {stories.map((story, i) => (
                  <li
                    key={story.id}
                    className="animate-fade-up flex items-center gap-3 rounded-2xl bg-sand p-3"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-border [&_svg]:h-8 [&_svg]:w-8"
                      style={{ background: story.wash }}
                    >
                      <SceneArt scene={story.scene} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-lg text-ink">{story.title}</p>
                      {story.context && (
                        <p className="truncate text-base text-ink-soft">{story.context}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditing(story)}
                      className={iconBtnClass}
                      aria-label={`Rewrite ${story.title}`}
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    {confirmRemoveId === story.id ? (
                      <button
                        type="button"
                        onClick={() => void handleRemove(story.id)}
                        className="min-w-[5.5rem] shrink-0 cursor-pointer rounded-full bg-destructive px-3 py-1.5 text-sm font-bold text-white transition-transform duration-150 ease-out active:scale-95"
                        aria-label={`Confirm removing ${story.title}`}
                      >
                        Remove?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => askRemove(story.id)}
                        className={iconBtnClass}
                        aria-label={`Remove ${story.title}`}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    // Portal to <body> so the backdrop covers the whole viewport: animated
    // ancestors (.animate-fade-up) keep a transform after playback, which
    // would otherwise become the containing block for this fixed overlay.
    document.body,
  );
}

const SCENE_LABELS: Record<StoryScene, string> = {
  cake: "Cake",
  garden: "Garden",
  tea: "Tea",
  wedding: "Rings",
  robin: "Robin",
  sunday: "Sunday",
};

function StoryForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Story | undefined;
  saving: boolean;
  onSave: (input: StoryInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [context, setContext] = useState(initial?.context ?? "");
  const [story, setStory] = useState(initial?.story ?? "");
  const [scene, setScene] = useState<StoryScene>(initial?.scene ?? "cake");
  const [photo, setPhoto] = useState<string | null>(initial?.photoDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give this story a name — what would you call it?");
      titleRef.current?.focus();
      return;
    }
    if (!story.trim()) {
      setError("Write a few lines about the day, so it can be told again.");
      return;
    }
    setError(null);
    onSave({ title, context, story, scene, photoDataUrl: photo });
  }

  /** Reads a chosen file, shrinks it, and keeps it as the story's picture. */
  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not a picture — choose a photo instead.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("That photo is too large — try one smaller than 20 MB.");
      return;
    }
    shrinkToDataUrl(file)
      .then((dataUrl) => {
        setError(null);
        setPhoto(dataUrl);
      })
      .catch(() => setError("That photo couldn't be opened — please try another one."));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="story-title" className="block text-base font-bold text-ink">
          What is it called?
        </label>
        <input
          id="story-title"
          type="text"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The day at the seaside"
          maxLength={80}
          aria-invalid={error && !title.trim() ? true : undefined}
          className={`${inputClass} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor="story-context" className="block text-base font-bold text-ink">
          When was it?
        </label>
        <input
          id="story-context"
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. A Sunday, last summer"
          maxLength={120}
          className={`${inputClass} mt-1.5`}
        />
        <p className="mt-1 text-sm text-ink-soft">
          A short line under the title — leave it blank if you like.
        </p>
      </div>

      <div>
        <label htmlFor="story-body" className="block text-base font-bold text-ink">
          What happened?
        </label>
        <textarea
          id="story-body"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="Tell it the way you would say it out loud."
          className={`${inputClass} mt-1.5 resize-none`}
        />
      </div>

      <fieldset>
        <legend className="block text-base font-bold text-ink">Choose a picture</legend>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a photo from your files"
          onChange={handleFile}
        />

        <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-border bg-sand p-3">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card text-ink-soft ring-1 ring-border"
          >
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-7 w-7" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Your own photo</p>
            <p className="text-sm text-ink-soft">
              {photo ? "This picture will be used." : "Pick one from your files."}
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
              onClick={() => setPhoto(null)}
              className="btn-ghost shrink-0"
            >
              Remove
            </button>
          )}
        </div>

        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-ink-soft">
          Or pick a drawing
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {SCENE_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setScene(option);
                setPhoto(null);
              }}
              aria-pressed={scene === option && !photo}
              aria-label={SCENE_LABELS[option]}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl p-1 transition-shadow duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${
                scene === option && !photo
                  ? "ring-2 ring-terracotta"
                  : "ring-1 ring-border hover:ring-2 hover:ring-terracotta/50"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-16 w-full items-center justify-center rounded-xl [&_svg]:h-10 [&_svg]:w-10"
                style={{ background: SCENE_WASHES[option] }}
              >
                <SceneArt scene={option} />
              </span>
              <span className="text-sm font-bold text-ink-soft">{SCENE_LABELS[option]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          <CheckIcon className="h-5 w-5" />
          {saving ? "Saving…" : initial ? "Save changes" : "Add the story"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
