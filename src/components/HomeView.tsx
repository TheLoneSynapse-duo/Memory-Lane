import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError } from "../data/api";
import { reloadHome, useHomeState } from "../data/home";
import {
  reloadSavedMemories,
  updateSavedMemory,
  useMemoriesState,
  type MemoryDestination,
  type SavedMemoryCard,
} from "../data/memoryStore";
import { greetingName, useProfile } from "../data/profile";
import DataNotice from "./DataNotice";
import ProfileDialog from "./ProfileDialog";
import { DESTINATION_OPTIONS } from "./destinationOptions";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  FaceIcon,
  HeartIcon,
  ImageIcon,
  PencilIcon,
  SparkleIcon,
} from "./icons";

/** How long one memory stays up before the next one takes its turn. */
const MEMORY_ROTATION_MS = 120_000;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function HomeView({
  onOpenFaces,
  onOpenCamera,
  onOpenStories,
  onOpenMemories,
}: {
  onOpenFaces: () => void;
  onOpenCamera: () => void;
  onOpenStories: () => void;
  onOpenMemories: () => void;
}) {
  const homeState = useHomeState();
  const memoriesState = useMemoriesState();
  const profile = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);

  const moments = homeState.data?.moments ?? [];
  const savedMemories = memoriesState.data.filter((m) => m.destinations.includes("home"));

  // The card is a slow slideshow: it starts on today's memory, then moves to
  // the next one every two minutes.
  const [memoryIndex, setMemoryIndex] = useState(() =>
    Math.floor(Date.now() / 86_400_000)
  );
  useEffect(() => {
    if (moments.length === 0) return;
    const id = window.setInterval(
      () => setMemoryIndex((i) => i + 1),
      MEMORY_ROTATION_MS
    );
    return () => window.clearInterval(id);
  }, [moments.length]);

  const memory = moments.length ? moments[memoryIndex % moments.length] : null;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const actions = [
    { icon: FaceIcon, label: "Who is this?", hint: "Name a face", onClick: onOpenFaces },
    { icon: CameraIcon, label: "Take a photo", hint: "Keep a moment", onClick: onOpenCamera },
    { icon: ImageIcon, label: "Stories", hint: "Read one back", onClick: onOpenStories },
    { icon: HeartIcon, label: "Memories", hint: "What you wrote", onClick: onOpenMemories },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* ---------- The hello ---------- */}
      <section
        className="animate-fade-up relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8"
        style={{
          background:
            "linear-gradient(140deg, #0f6f63 0%, #0a544a 55%, #08332e 100%)",
        }}
        aria-label="Welcome"
      >
        <span
          aria-hidden="true"
          className="absolute -right-14 -top-16 h-52 w-52 rounded-full bg-white/10"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-24 right-28 h-44 w-44 rounded-full bg-white/5"
        />

        <p className="relative text-xs font-bold uppercase tracking-[0.16em] text-white/75">
          {dateLabel}
        </p>
        <h1 className="relative mt-2 font-heading text-4xl font-extrabold leading-tight sm:text-5xl">
          Hello, {greetingName(profile) || "friend"}.
        </h1>
        <p className="relative mt-2 max-w-lg text-lg text-white/85">
          {greeting()}, keeping your softest memories close.
        </p>

        <div className="relative mt-6 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
            {savedMemories.length}{" "}
            {savedMemories.length === 1 ? "memory" : "memories"} saved
          </span>
          <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
            {moments.length} {moments.length === 1 ? "moment" : "moments"} written
          </span>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-haspopup="dialog"
            className="ml-auto cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-bold text-terracotta-deep shadow-sm transition-colors duration-150 hover:bg-mint active:scale-95"
          >
            Personal details
          </button>
        </div>
      </section>

      {/* ---------- Quick actions ---------- */}
      <section
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Quick actions"
      >
        {actions.map(({ icon: Icon, label, hint, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="panel group flex cursor-pointer flex-col items-start gap-3 p-4 text-left shadow-xs transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint text-terracotta-deep transition-colors duration-150 group-hover:bg-terracotta group-hover:text-white"
              aria-hidden="true"
            >
              <Icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-heading text-base font-extrabold leading-snug text-ink">
                {label}
              </span>
              <span className="block text-sm leading-snug text-ink-soft">{hint}</span>
            </span>
          </button>
        ))}
      </section>

      {/* ---------- Memory of the day ---------- */}
      <section
        className="panel animate-fade-up mt-6 overflow-hidden"
        aria-label="Your memory library"
      >
        <div className="flex items-center gap-2 border-b border-border bg-sand/70 px-5 py-3 sm:px-6">
          <SparkleIcon className="h-4 w-4 text-terracotta" aria-hidden="true" />
          <p className="kicker">Your memory library</p>
          {moments.length > 1 && (
            <p className="ml-auto text-xs font-semibold uppercase tracking-wider text-ink-soft">
              A new memory every 2 minutes
            </p>
          )}
        </div>
        <div className="p-5 sm:p-7">
        {homeState.status !== "ready" ? (
          <DataNotice
            state={homeState}
            loadingMessage="Finding today's memory…"
            onRetry={reloadHome}
          />
        ) : memory ? (
          // Keyed on the moment so each swap fades the new memory in.
          <div key={memory.id} className="animate-fade-up">
            {memory.photoDataUrl && (
              <img
                src={memory.photoDataUrl}
                alt=""
                className="mb-4 max-h-64 w-full rounded-2xl object-cover ring-1 ring-border"
              />
            )}
            <p className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-ink-soft">
              <SparkleIcon className="h-4 w-4 text-ochre-deep" />
              {memory.title}
            </p>
            <p className="mt-3 text-lg leading-relaxed text-ink">{memory.text}</p>
          </div>
        ) : (
          <div className="text-center">
            <SparkleIcon
              className="mx-auto h-8 w-8 text-ochre-deep"
              aria-hidden="true"
            />
            <p className="mt-3 font-heading text-xl text-ink">
              No moments written down yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-lg text-ink-soft">
              Write one in Memories and it can be the memory you open the day
              with.
            </p>
            <button type="button" onClick={onOpenMemories} className="btn-primary mt-5">
              <HeartIcon className="h-5 w-5" />
              Open Memories
            </button>
          </div>
        )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="library-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">Kept in one place</p>
            <h2
              id="library-heading"
              className="mt-1.5 font-heading text-2xl text-ink"
            >
              Your memory library for the Day
            </h2>
          </div>
          <button type="button" onClick={onOpenCamera} className="btn-ghost">
            <CameraIcon className="h-5 w-5" />
            Take a photo
          </button>
        </div>

        {memoriesState.status !== "ready" ? (
          <DataNotice
            state={memoriesState}
            loadingMessage="Gathering your saved memories…"
            onRetry={reloadSavedMemories}
            className="mt-4"
          />
        ) : savedMemories.length === 0 ? (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-sand-deep bg-card px-6 py-8 text-center shadow-sm">
            <CameraIcon className="mx-auto h-10 w-10 text-ink-soft" aria-hidden="true" />
            <p className="mt-3 font-heading text-xl text-ink">Nothing saved yet</p>
            <p className="mx-auto mt-1 max-w-sm text-lg text-ink-soft">
              Your first saved memory will appear here. Open the camera, snap a
              photo, add who it is — and it's kept, safe and sound.
            </p>
            <button type="button" onClick={onOpenCamera} className="btn-primary mt-5">
              <CameraIcon className="h-6 w-6" />
              Take a photo
            </button>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {savedMemories.map((m, index) => (
              <li
                key={m.id}
                className="animate-fade-up rounded-2xl border border-border bg-card shadow-xs"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <LibraryCard memory={m} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="worth-remembering-heading">
        <p className="kicker">Written down by you</p>
        <h2
          id="worth-remembering-heading"
          className="mt-1.5 font-heading text-2xl text-ink"
        >
          Moments worth keeping
        </h2>
        {moments.length === 0 ? (
          <DataNotice
            state={homeState}
            loadingMessage="Gathering the moments worth keeping…"
            onRetry={reloadHome}
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {moments.map((m) => (
              <li key={m.id} className="flex gap-4 rounded-2xl bg-sand p-5">
                <HeartIcon className="mt-1 h-5 w-5 shrink-0 text-terracotta" />
                <div className="min-w-0 flex-1">
                  {m.photoDataUrl && (
                    <img
                      src={m.photoDataUrl}
                      alt=""
                      className="mb-3 max-h-44 w-full rounded-xl object-cover ring-1 ring-border"
                    />
                  )}
                  <p className="font-sans text-base font-bold text-ink">{m.title}</p>
                  <p className="mt-1 text-base leading-relaxed text-ink-soft">{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

function destinationLabels(destinations: MemoryDestination[]): string {
  return DESTINATION_OPTIONS.filter((o) => destinations.includes(o.id))
    .map((o) => o.label)
    .join(", ");
}

function LibraryCard({ memory }: { memory: SavedMemoryCard }) {
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    caption: memory.caption,
    name: memory.name,
    metNote: memory.metNote,
    destinations: [...memory.destinations],
  });

  const formRef = useRef<HTMLFormElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const openedRef = useRef(false);
  const savedTimerRef = useRef<number | null>(null);

  // When edit mode opens, focus the first field. When it closes, hand focus
  // back to the Edit button so keyboard users always know where they are.
  useEffect(() => {
    if (editing) {
      openedRef.current = true;
      const t = window.setTimeout(() => {
        formRef.current
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            "input, textarea"
          )
          ?.focus();
      }, 0);
      return () => window.clearTimeout(t);
    }
    if (openedRef.current) {
      openedRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  function startEditing() {
    setDraft({
      caption: memory.caption,
      name: memory.name,
      metNote: memory.metNote,
      destinations: [...memory.destinations],
    });
    setJustSaved(false);
    setSaveError(null);
    setEditing(true);
  }

  function closeEditing() {
    setEditing(false);
  }

  function toggleDestination(id: MemoryDestination) {
    setDraft((d) => ({
      ...d,
      destinations: d.destinations.includes(id)
        ? d.destinations.filter((x) => x !== id)
        : [...d.destinations, id],
    }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await updateSavedMemory(memory.id, {
        caption: draft.caption.trim() || "A new memory",
        name: draft.name.trim(),
        metNote: draft.metNote.trim(),
        destinations: draft.destinations,
      });
      setEditing(false);
      setJustSaved(true);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 2600);
    } catch (error) {
      setSaveError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  const captionId = `edit-caption-${memory.id}`;
  const nameId = `edit-name-${memory.id}`;
  const noteId = `edit-note-${memory.id}`;

  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:p-6">
      {memory.photoDataUrl ? (
        <img
          src={memory.photoDataUrl}
          alt={`A snapshot${memory.name ? ` with ${memory.name}` : " of a moment"}`}
          className="h-28 w-full rounded-xl object-cover ring-1 ring-border sm:h-28 sm:w-28 sm:shrink-0"
        />
      ) : (
        <span
          className="flex h-28 w-full items-center justify-center rounded-xl bg-sand ring-1 ring-border sm:h-28 sm:w-28 sm:shrink-0"
          aria-hidden="true"
        >
          <ImageIcon className="h-9 w-9 text-ink-soft" />
        </span>
      )}

      {editing ? (
        <form
          ref={formRef}
          onSubmit={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeEditing();
            }
          }}
          className="min-w-0 flex-1"
          aria-label={`Edit memory: ${memory.caption}`}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor={captionId} className="block text-base font-bold text-ink">
                Caption
              </label>
              <input
                id={captionId}
                type="text"
                value={draft.caption}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, caption: e.target.value }))
                }
                maxLength={120}
                className="mt-1.5 w-full rounded-xl border-2 border-sand-deep bg-white px-3.5 py-2.5 text-base leading-snug text-ink placeholder:text-ink-soft/80 focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              />
            </div>

            <div>
              <label htmlFor={nameId} className="block text-base font-bold text-ink">
                Who is in the photo?
              </label>
              <input
                id={nameId}
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={40}
                placeholder="e.g. The lady from the shop"
                className="mt-1.5 w-full rounded-xl border-2 border-sand-deep bg-white px-3.5 py-2.5 text-base leading-snug text-ink placeholder:text-ink-soft/80 focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              />
            </div>

            <div>
              <label htmlFor={noteId} className="block text-base font-bold text-ink">
                How did you meet? <span className="text-ink-soft">(optional)</span>
              </label>
              <textarea
                id={noteId}
                value={draft.metNote}
                onChange={(e) => setDraft((d) => ({ ...d, metNote: e.target.value }))}
                rows={2}
                maxLength={280}
                placeholder="e.g. We met every Tuesday at the bowls club"
                className="mt-1.5 w-full resize-y rounded-xl border-2 border-sand-deep bg-white px-3.5 py-2.5 text-base leading-snug text-ink placeholder:text-ink-soft/80 focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              />
            </div>

            <fieldset>
              <legend className="text-base font-bold text-ink">
                Where is this kept?
              </legend>
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label="Places this memory is kept"
              >
                {DESTINATION_OPTIONS.map(({ id, label, icon: Icon }) => {
                  const active = draft.destinations.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleDestination(id)}
                      aria-pressed={active}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1.5 text-base font-bold transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-[0.97] ${
                        active
                          ? "border-terracotta bg-card text-ink shadow-sm"
                          : "border-sand-deep bg-transparent text-ink-soft hover:border-ochre"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {saveError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink"
            >
              {saveError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              <CheckIcon className="h-5 w-5" />
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={closeEditing} className="btn-ghost">
              <CloseIcon className="h-5 w-5" aria-hidden="true" />
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink">{memory.caption}</p>
              {memory.name && (
                <p className="mt-0.5 text-ink-soft">Remembered as {memory.name}</p>
              )}
            </div>
            <button
              ref={editButtonRef}
              type="button"
              onClick={startEditing}
              aria-label={`Edit ${memory.caption}`}
              className="btn-ghost shrink-0 !px-3 !py-1.5 text-sm"
            >
              <PencilIcon className="h-4 w-4" aria-hidden="true" />
              Edit
            </button>
          </div>

          {memory.metNote && (
            <p className="mt-1 text-ink-soft">How you met: {memory.metNote}</p>
          )}

          <p className="mt-1.5 text-sm font-semibold text-ink-soft">
            Saved {formatDate(memory.createdAt)}
          </p>

          <p className="mt-2 text-sm text-ink-soft">
            Kept in {destinationLabels(memory.destinations)}
          </p>

          <p className="mt-2 text-sm font-semibold text-sage-deep" aria-live="polite">
            {justSaved && "Changes saved ✓"}
          </p>
        </div>
      )}
    </div>
  );
}
