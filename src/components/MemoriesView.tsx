import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError } from "../data/api";
import {
  addMoment,
  reloadHome,
  removeMoment,
  updateMoment,
  useHomeState,
  type Moment,
  type MomentInput,
} from "../data/home";
import DataNotice from "./DataNotice";
import PhotoPicker from "./PhotoPicker";
import {
  CheckIcon,
  CloseIcon,
  HeartIcon,
  PencilIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from "./icons";

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/70 shadow-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const iconBtnClass =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-ink-soft ring-1 ring-border transition-colors duration-150 hover:bg-sand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-95";

/**
 * The Memories screen: every moment worth keeping, with the option to add a
 * new one or rewrite one that is already written down — the Home screen only
 * ever reads them.
 */
export default function MemoriesView() {
  const homeState = useHomeState();
  const moments = homeState.data?.moments ?? [];

  /** "new" while adding; otherwise the moment being edited. */
  const [editor, setEditor] = useState<{ id: string } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  function flashSaved() {
    setSaved(true);
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSaved(false), 2600);
  }

  function startAdding() {
    setEditor({ id: "new" });
    setConfirmRemoveId(null);
    setError(null);
  }

  function startEditing(moment: Moment) {
    setEditor({ id: moment.id });
    setConfirmRemoveId(null);
    setError(null);
  }

  function cancelEditing() {
    setEditor(null);
    setError(null);
    addBtnRef.current?.focus();
  }

  async function handleSave(input: MomentInput) {
    setError(null);
    setSaving(true);
    try {
      if (editor?.id === "new") {
        await addMoment(input);
      } else if (editor) {
        await updateMoment(editor.id, input);
      }
      setEditor(null);
      flashSaved();
      addBtnRef.current?.focus();
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
    if (editor?.id === id) setEditor(null);
    try {
      await removeMoment(id);
    } catch (removeError) {
      setError(describeError(removeError));
    }
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveId(null);
  }

  const editingMoment =
    editor && editor.id !== "new" ? moments.find((m) => m.id === editor.id) : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-terracotta">
        <SparkleIcon className="h-4 w-4" aria-hidden="true" />
        Memories
      </p>
      <h1 className="mt-2 font-heading text-3xl leading-tight text-ink sm:text-4xl">
        Moments worth keeping.
      </h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
        The small things you would hate to lose. Write a new one here, or change
        one that is already written down — the Home screen reads them from
        here.
      </p>

      {saved && (
        <p
          role="status"
          className="animate-fade-up mt-5 inline-flex items-center gap-2 rounded-2xl bg-sage px-4 py-3 font-semibold text-ink"
        >
          <CheckIcon className="h-5 w-5 text-ochre-deep" aria-hidden="true" />
          Saved — your moments are up to date.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-ochre bg-ochre-soft px-4 py-3 text-lg text-ink"
        >
          {error}
        </p>
      )}

      <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl text-ink">Your moments</h2>
        {editor?.id !== "new" && moments.length > 0 && (
          <button
            ref={addBtnRef}
            type="button"
            onClick={startAdding}
            className="btn-secondary"
          >
            <PlusIcon className="h-5 w-5" />
            Add a memory
          </button>
        )}
      </div>

      {homeState.status !== "ready" ? (
        <DataNotice
          state={homeState}
          loadingMessage="Gathering the moments you've kept…"
          onRetry={reloadHome}
          className="mt-4"
        />
      ) : editor?.id === "new" ? (
        <div className="animate-fade-up mt-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          <MomentForm
            saving={saving}
            onSave={handleSave}
            onCancel={cancelEditing}
          />
        </div>
      ) : moments.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-sand px-5 py-10 text-center">
          <HeartIcon
            className="mx-auto h-10 w-10 text-terracotta"
            aria-hidden="true"
          />
          <p className="mt-3 font-heading text-xl text-ink">
            Nothing written down yet
          </p>
          <p className="mt-1 text-lg text-ink-soft">
            Start with the one you find yourself telling people about.
          </p>
          <button type="button" onClick={startAdding} className="btn-primary mt-5">
            <PlusIcon className="h-5 w-5" />
            Add a memory
          </button>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {moments.map((moment, index) =>
            editingMoment?.id === moment.id ? (
              <li
                key={moment.id}
                className="animate-fade-up rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border"
              >
                <MomentForm
                  key={moment.id}
                  initial={moment}
                  saving={saving}
                  onSave={handleSave}
                  onCancel={cancelEditing}
                />
              </li>
            ) : (
              <li
                key={moment.id}
                className="animate-fade-up flex gap-4 rounded-2xl bg-sand p-5"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <HeartIcon
                  className="mt-1 h-5 w-5 shrink-0 text-terracotta"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  {moment.photoDataUrl && (
                    <img
                      src={moment.photoDataUrl}
                      alt=""
                      className="mb-3 max-h-56 w-full rounded-xl object-cover ring-1 ring-border"
                    />
                  )}
                  <p className="font-sans text-base font-bold text-ink">
                    {moment.title}
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-ink-soft">
                    {moment.text}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(moment)}
                    className={iconBtnClass}
                    aria-label={`Edit ${moment.title}`}
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  {confirmRemoveId === moment.id ? (
                    <button
                      type="button"
                      onClick={() => void handleRemove(moment.id)}
                      className="min-w-[5.5rem] shrink-0 cursor-pointer rounded-full bg-destructive px-3 py-1.5 text-sm font-bold text-white transition-transform duration-150 ease-out active:scale-95"
                      aria-label={`Confirm removing ${moment.title}`}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askRemove(moment.id)}
                      className={iconBtnClass}
                      aria-label={`Remove ${moment.title}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

/** The add / edit form for one moment. */
function MomentForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: Moment;
  saving: boolean;
  onSave: (input: MomentInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [photo, setPhoto] = useState<string | null>(initial?.photoDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Nothing to save until something is actually changed — opening a moment
  // should never look like it is demanding to be rewritten.
  const unchanged =
    initial !== undefined &&
    title.trim() === initial.title &&
    text.trim() === initial.text &&
    photo === (initial.photoDataUrl ?? null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give this moment a name — what would you call it?");
      titleRef.current?.focus();
      return;
    }
    if (!text.trim()) {
      setError("Write a few lines about it, so it can be kept.");
      return;
    }
    setError(null);
    onSave({ title: title.trim(), text: text.trim(), photoDataUrl: photo });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={initial ? `Edit ${initial.title}` : "Add a memory"}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div>
        <label htmlFor="moment-title" className="block text-base font-bold text-ink">
          What is it called?
        </label>
        <input
          id="moment-title"
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="e.g. The harbor, 2019"
          className={`${inputClass} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor="moment-text" className="block text-base font-bold text-ink">
          What happened?
        </label>
        <textarea
          id="moment-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={600}
          placeholder="Tell it the way you would say it out loud."
          className={`${inputClass} mt-1.5 resize-none`}
        />
      </div>

      <PhotoPicker photo={photo} onChange={setPhoto} onError={setError} />

      {error && (
        <p role="alert" className="font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || unchanged}
        >
          <CheckIcon className="h-5 w-5" />
          {saving ? "Saving…" : initial ? "Save changes" : "Add the memory"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving}
        >
          <CloseIcon className="h-5 w-5" aria-hidden="true" />
          Cancel
        </button>
        {unchanged && !saving && (
          <p className="text-sm text-ink-soft">
            Nothing has been changed yet.
          </p>
        )}
      </div>
    </form>
  );
}
