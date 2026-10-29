import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { type AgentFocus } from "../data/agentFocus";
import { describeError } from "../data/api";
import {
  cardText,
  deletePerson,
  type FaceMatch,
  matchPhoto,
  reloadPeople,
  updatePersonPhoto,
  usePeopleState,
  type Person,
} from "../data/people";
import { useMemoriesState } from "../data/memoryStore";
import AddPersonForm from "./AddPersonForm";
import DataNotice from "./DataNotice";
import PhotoPicker from "./PhotoPicker";
import PhotoGallery from "./PhotoGallery";
import {
  CameraIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  HeartIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  SparkleIcon,
  TrashIcon,
  VolumeIcon,
} from "./icons";

type Stage = "choose" | "checking" | "detail";

const speechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

export default function WhoIsThis({
  focus = null,
  onFocusHandled,
}: {
  /** A request from the companion to bring someone on screen (see agentFocus). */
  focus?: AgentFocus | null;
  /** Called once that request has been carried out. */
  onFocusHandled?: () => void;
} = {}) {
  const peopleState = usePeopleState();
  const people = peopleState.data;

  const [stage, setStage] = useState<Stage>("choose");
  const [photoCandidates, setPhotoCandidates] = useState<FaceMatch["people"]>([]);
  const [selectedPhotoDataUrl, setSelectedPhotoDataUrl] = useState<string | null>(null);
  const [linkingPhoto, setLinkingPhoto] = useState(false);
  /** The Add form, when it is open — carrying any photo/name it started from. */
  const [addingFace, setAddingFace] = useState<{
    photo: string | null;
    name: string;
  } | null>(null);
  /** The face whose card is being opened or deleted (see FaceChooser). */
  const [choosing, setChoosing] = useState<Person | null>(null);
  /** One-off message after someone leaves the circle. */
  const [notice, setNotice] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [cameFromPhoto, setCameFromPhoto] = useState(false);
  const [pickedPhotoUrl, setPickedPhotoUrl] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  // Each photo selection gets a number; stale file-reader callbacks are ignored.
  const attemptRef = useRef(0);

  // Clean up speech + object URLs on unmount.
  useEffect(() => {
    return () => {
      attemptRef.current += 1;
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  // Stop spoken text if the user switches away or back to choose.
  useEffect(() => {
    return () => {
      setReading(false);
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, [stage]);

  function openPerson(p: Person, fromPhoto = false) {
    stopReading();
    setMatchError(null);
    setChoosing(null);
    setPerson(p);
    setCameFromPhoto(fromPhoto);
    setStage("detail");
  }

  // When the companion asks for someone — "who's Ellen?" — open their card as
  // soon as the circle has loaded, from wherever the person happened to be in
  // the app. The request is cleared afterwards so it happens once.
  const focusAt = focus?.at ?? 0;
  const focusId = focus?.kind === "person" ? focus.personId : null;
  useEffect(() => {
    if (!focusId || peopleState.status !== "ready") return;

    const match = people.find((p) => p.id === focusId);
    if (match) {
      openPerson(match);
      // Bring the card into view: it replaces the top of this page, which the
      // person may well be scrolled past.
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
    onFocusHandled?.();
    // openPerson is redeclared each render; the request itself is what should
    // re-run this, which is what focusAt and focusId describe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAt, focusId, peopleState.status, people, onFocusHandled]);

  function stopReading() {
    setReading(false);
    if (speechSupported()) window.speechSynthesis.cancel();
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;

    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;
    setPickedPhotoUrl(url);
    setMatchError(null);
    setStage("checking");
    setPhotoCandidates([]);
    setSelectedPhotoDataUrl(null);

    const reader = new FileReader();
    reader.onload = () => {
      const photoDataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!photoDataUrl) {
        tryAnother();
        setMatchError("That photograph could not be read. Please try another one.");
        return;
      }
      void matchPhoto()
        .then(({ people: candidates }) => {
          if (attemptRef.current !== attempt) return;
          setSelectedPhotoDataUrl(photoDataUrl);
          setPhotoCandidates(candidates);
          setStage("choose");
        })
        .catch((error) => {
          if (attemptRef.current !== attempt) return;
          tryAnother();
          setMatchError(describeError(error));
        });
    };
    reader.onerror = () => {
      if (attemptRef.current !== attempt) return;
      tryAnother();
      setMatchError("That photograph couldn't be read. Please try another one.");
    };
    reader.readAsDataURL(file);
  }

  async  function choosePersonForPhoto(candidate: FaceMatch["people"][number]) {
    if (!selectedPhotoDataUrl || linkingPhoto) return;
    setLinkingPhoto(true);
    setMatchError(null);
    try {
      const saved = await updatePersonPhoto(candidate.id, selectedPhotoDataUrl);
      openPerson(saved, true);
    } catch (error) {
      setMatchError(describeError(error));
    } finally {
      setLinkingPhoto(false);
    }
  }

  function tryAnother() {
    attemptRef.current += 1;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPickedPhotoUrl(null);
    setPhotoCandidates([]);
    setSelectedPhotoDataUrl(null);
    setPerson(null);
    setCameFromPhoto(false);
    setStage("choose");
  }

  function toggleReading() {
    if (!speechSupported() || !person) return;
    if (reading) {
      window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(cardText(person));
    utter.rate = 0.92;
    utter.pitch = 1;
    utter.onend = () => setReading(false);
    utter.onerror = () => setReading(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    setReading(true);
  }

  return (
    <section
      className="mx-auto w-full max-w-3xl px-5 pb-32 pt-6 sm:px-6 sm:pt-10"
      aria-label="Who is this?"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
        aria-label="Choose a photograph"
      />

      {stage === "checking" && pickedPhotoUrl && (
        <div className="animate-fade-up">
          <h2 className="font-heading text-4xl">Who is this?</h2>
          <p className="mt-2 text-lg text-ink-soft">
            Preparing your photograph…
          </p>

          <div className="relative mx-auto mt-6 aspect-[4/3] max-w-md overflow-hidden rounded-3xl border-4 border-card shadow-lg">
            <img
              src={pickedPhotoUrl}
              alt="The photograph you chose"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <p className="text-sm text-ink-soft">
              Preparing your photo so you can link it to someone in your circle…
            </p>
            <button type="button" onClick={tryAnother} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "choose" && (
        <div className="animate-fade-up">
          <h2 className="font-heading text-4xl leading-tight">Who is this?</h2>
          <p className="mt-2 max-w-md text-lg leading-relaxed text-ink-soft">
            Choose a photo and then select who it belongs to. You can also add
            someone new and keep the details you want to remember.
          </p>

          {pickedPhotoUrl && selectedPhotoDataUrl && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <img
                  src={pickedPhotoUrl}
                  alt="Selected photo"
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <div>
                  <p className="font-heading text-lg text-ink">Link this photo to a person</p>
                  <p className="text-sm text-ink-soft">Choose the person you recognize.</p>
                </div>
              </div>
              {photoCandidates.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-3" aria-label="People to link to this photo">
                  {photoCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => void choosePersonForPhoto(candidate)}
                        disabled={linkingPhoto}
                        className="group flex w-24 flex-col items-center gap-2 rounded-2xl p-2 hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:opacity-60"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full shadow-md ring-4 ring-card"
                          style={candidate.photoDataUrl ? undefined : { background: candidate.gradient }}
                        >
                          {candidate.photoDataUrl ? (
                            <img src={candidate.photoDataUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-heading text-2xl text-white/95">{candidate.initials}</span>
                          )}
                        </span>
                        <span className="text-center">
                          <span className="block font-bold text-ink">{candidate.name}</span>
                          <span className="block text-xs text-ink-soft">{candidate.relationship}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-ink-soft">Your circle is empty. Add the person in this photo to get started.</p>
                  <button
                    type="button"
                    onClick={() => setAddingFace({ photo: selectedPhotoDataUrl, name: "" })}
                    className="btn-primary mt-3"
                  >
                    <PlusIcon className="h-5 w-5" />
                    Add this person
                  </button>
                </div>
              )}
              <button type="button" onClick={tryAnother} className="btn-ghost mt-3">
                Clear photo
              </button>
            </div>
          )}

          {matchError && (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-ochre bg-ochre-soft p-4 text-lg text-ink"
            >
              {matchError}
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-sage px-4 py-2 text-base font-semibold text-ink"
            >
              <CheckIcon className="h-4 w-4 text-ochre-deep" aria-hidden="true" />
              {notice}
            </p>
          )}

          <div className="mt-7">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-primary"
            >
              <CameraIcon className="h-6 w-6" />
              Choose a photograph
            </button>
            <p className="mt-3 text-sm text-ink-soft">
              Choose someone from your circle, or add a new person below.
            </p>
          </div>

          {peopleState.status !== "ready" ? (
            <DataNotice
              state={peopleState}
              loadingMessage="Gathering the faces you know…"
              onRetry={reloadPeople}
              className="mt-4"
            />
          ) : (
            <div className="mt-4">
              {people.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-sand px-5 py-7 text-center">
                  <p className="font-heading text-xl text-ink">Your circle starts here</p>
                  <p className="mt-1 text-base text-ink-soft">
                    Add someone you know, or choose a photo to create their first card.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-5" role="list" aria-label="Your people">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="listitem"
                      onClick={() => setChoosing(p)}
                      className="group flex w-24 flex-col items-center gap-2 rounded-2xl p-2 transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:scale-95"
                      aria-label={`${p.name}, ${p.relationship} — open or delete their card`}
                      aria-haspopup="dialog"
                    >
                      <Avatar p={p} />
                      <span className="text-center">
                        <span className="block font-sans text-base font-bold leading-tight text-ink">
                          {p.name}
                        </span>
                        <span className="block text-xs leading-tight text-ink-soft">
                          {p.relationship}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* The Add option, sitting at the end of the circle. */}
              <button
                type="button"
                role="listitem"
                onClick={() =>
                  setAddingFace((open) =>
                    open ? null : { photo: null, name: "" }
                  )
                }
                aria-expanded={addingFace !== null}
                aria-label="Add a familiar face to your circle"
                className="group flex w-24 flex-col items-center gap-2 rounded-2xl p-2 transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:scale-95"
              >
                <span
                  aria-hidden="true"
                  className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-sand-deep bg-sand text-ink-soft ring-4 ring-card transition-colors duration-150 group-hover:border-terracotta/60 group-hover:text-terracotta"
                >
                  <PlusIcon className="h-8 w-8" />
                </span>
                <span className="text-center">
                  <span className="block font-sans text-base font-bold leading-tight text-ink">
                    Add
                  </span>
                  <span className="block text-xs leading-tight text-ink-soft">
                    a familiar face
                  </span>
                </span>
              </button>
            </div>
          )}

          {addingFace && (
            <AddPersonForm
              key={addingFace.photo ?? "blank"}
              initialPhoto={addingFace.photo}
              initialName={addingFace.name}
              onAdded={(added) => {
                setAddingFace(null);
                openPerson(added);
              }}
              onCancel={() => setAddingFace(null)}
            />
          )}

          <PhotoGallery
            scope="all"
            people={people}
            onOpenPerson={(p) => openPerson(p)}
            onAddToPeople={(memory) =>
              setAddingFace({
                photo: memory.photoDataUrl,
                name: memory.name || "",
              })
            }
          />

          {choosing && (
            <FaceChooser
              person={choosing}
              onClose={() => setChoosing(null)}
              onOpen={() => openPerson(choosing)}
              onDelete={async () => {
                try {
                  await deletePerson(choosing.id);
                  setChoosing(null);
                  setNotice(`${choosing.name} has been taken out of your circle.`);
                  if (person?.id === choosing.id) {
                    setPerson(null);
                    setStage("choose");
                  }
                } catch (deleteError) {
                  // The dialog keeps itself open and shows the reason.
                  throw deleteError;
                }
              }}
            />
          )}
        </div>
      )}

      {stage === "detail" && person && (
        <PersonCard
          person={person}
          cameFromPhoto={cameFromPhoto}
          pickedPhotoUrl={pickedPhotoUrl}
          reading={reading}
          onBack={tryAnother}
          onToggleReading={toggleReading}
          onPhotoSaved={setPerson}
        />
      )}
    </section>
  );
}

/**
 * Tapping a face in the circle: two ways on — open their card, or take it off
 * the circle. Both options are shown at once and fade up so the choice reads
 * as a gentle pause rather than a menu.
 */
function FaceChooser({
  person,
  onClose,
  onOpen,
  onDelete,
}: {
  person: Person;
  onClose: () => void;
  onOpen: () => void;
  /** Removes the person; rejects with a message the dialog can show. */
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Focus the dialog on open and give focus back to the face that opened it.
  useEffect(() => {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    (confirming ? closeRef.current : openRef.current)?.focus();
    return () => lastTriggerRef.current?.focus();
    // Only when the dialog first mounts — the confirm step moves focus below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus follows the confirm step as it appears.
  useEffect(() => {
    if (confirming) closeRef.current?.focus();
  }, [confirming]);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirming) setConfirming(false);
        else onClose();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
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
  }, [onClose, confirming]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      // The parent closes the dialog on success.
    } catch (deleteError) {
      setError(describeError(deleteError));
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`What would you like to do with ${person.name}'s card?`}
        className="animate-lightbox-in w-full max-w-sm overflow-hidden rounded-3xl bg-card p-6 text-center shadow-2xl ring-1 ring-border"
      >
        <span
          className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full shadow-md ring-4 ring-sand"
          style={person.photoDataUrl ? undefined : { background: person.gradient }}
          aria-hidden="true"
        >
          {person.photoDataUrl ? (
            <img src={person.photoDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-heading text-2xl text-white/95">
              {person.initials}
            </span>
          )}
        </span>

        <p className="mt-3 font-heading text-2xl text-ink">{person.name}</p>
        <p className="text-base text-ink-soft">{person.relationship}</p>

        {!confirming ? (
          <div className="mt-5 flex flex-col gap-3">
            <button
              ref={openRef}
              type="button"
              onClick={onOpen}
              className="btn-primary w-full"
            >
              <HeartIcon className="h-5 w-5" aria-hidden="true" />
              Open the info
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-ghost w-full !border-destructive/40 !text-destructive hover:!bg-destructive/10 hover:!border-destructive"
            >
              <TrashIcon className="h-5 w-5" aria-hidden="true" />
              Delete the info
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-base leading-relaxed text-ink">
              Take <strong>{person.name}</strong> off your circle? Their card
              and everything written about them will be gone.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink"
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                ref={closeRef}
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="btn-primary flex-1 !bg-destructive !shadow-none hover:!bg-destructive/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <TrashIcon className="h-5 w-5" aria-hidden="true" />
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="btn-ghost flex-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep them
              </button>
            </div>
          </div>
        )}

        {!confirming && (
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost mt-3 w-full"
          >
            <CloseIcon className="h-4 w-4" aria-hidden="true" />
            Not now
          </button>
        )}
      </div>
    </div>,
    // Portalled to <body> so the backdrop covers the whole viewport, the same
    // way the photo preview does (see Lightbox below).
    document.body,
  );
}

function Avatar({ p }: { p: Person }) {
  return (
    <span
      className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full shadow-md ring-4 ring-card transition-shadow duration-150 ease-out group-hover:shadow-lg"
      style={p.photoDataUrl ? undefined : { background: p.gradient }}
      aria-hidden="true"
    >
      {p.photoDataUrl ? (
        <img src={p.photoDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-heading text-2xl text-white/95">{p.initials}</span>
      )}
    </span>
  );
}

function PersonCard({
  person,
  cameFromPhoto,
  pickedPhotoUrl,
  reading,
  onBack,
  onToggleReading,
  onPhotoSaved,
}: {
  person: Person;
  cameFromPhoto: boolean;
  pickedPhotoUrl: string | null;
  reading: boolean;
  onBack: () => void;
  onToggleReading: () => void;
  /** Hands the confirmed copy of this person back to the page that opened it. */
  onPhotoSaved: (saved: Person) => void;
}) {
  const memoriesState = useMemoriesState();
  const savedPersonPhotos = memoriesState.data.filter(
    (m) =>
      m.destinations.includes("faces") &&
      (m.name || "").trim().toLowerCase() === person.name.trim().toLowerCase() &&
      m.photoDataUrl
  );
  const [lightbox, setLightbox] = useState<LightboxContent | null>(null);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);

  // The editor unmounts when it closes, so hand focus back to the button that
  // opened it — keyboard users always know where they are.
  function closeEditor() {
    setEditingPhoto(false);
    editBtnRef.current?.focus();
  }

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-back">
          <ChevronLeftIcon className="h-5 w-5" />
          All faces
        </button>
        <button
          ref={editBtnRef}
          type="button"
          onClick={() => {
            setEditingPhoto((open) => !open);
            setPhotoSaved(false);
          }}
          aria-expanded={editingPhoto}
          className="btn-ghost shrink-0"
        >
          <PencilIcon className="h-4 w-4" aria-hidden="true" />
          {editingPhoto ? "Close" : "Edit photo"}
        </button>
      </div>

      {photoSaved && (
        <p
          role="status"
          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-sage px-4 py-2 text-base font-semibold text-ink"
        >
          <CheckIcon className="h-4 w-4 text-ochre-deep" aria-hidden="true" />
          Photograph saved
        </p>
      )}

      {editingPhoto && (
        <PersonPhotoEditor
          key={person.id}
          person={person}
          onCancel={closeEditor}
          onSaved={(saved) => {
            // The card holds the person it opened with, so swap in the copy
            // the server just confirmed — the photograph appears at once.
            onPhotoSaved(saved);
            closeEditor();
            setPhotoSaved(true);
            if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
            savedTimerRef.current = window.setTimeout(() => setPhotoSaved(false), 2600);
          }}
        />
      )}          {cameFromPhoto && (
            <div
              className="mt-4 flex items-start gap-3 rounded-2xl border border-ochre/60 bg-ochre-soft p-4 sm:items-center"
              role="status"
            >
              <SparkleIcon className="mt-0.5 h-5 w-5 shrink-0 text-ochre-deep" />
              <p className="text-base text-ink">
                You selected <strong>{person.name}</strong> for this photograph.
              </p>
            </div>
          )}

      <article className="mt-5 overflow-hidden rounded-3xl bg-card shadow-md ring-1 ring-border">
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/8]">
          {pickedPhotoUrl ? (
            <img
              src={pickedPhotoUrl}
              alt={`The photograph you linked to ${person.name}`}
              className="h-full w-full object-cover"
            />
          ) : person.photoDataUrl ? (
            <img
              src={person.photoDataUrl}
              alt={`A photograph of ${person.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: person.gradient }}
              aria-hidden="true"
            >
              <span className="font-heading text-7xl text-white/90">
                {person.initials}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
          <div className="absolute inset-x-5 bottom-4">
            <h2 className="font-heading text-4xl text-white drop-shadow-sm">
              {person.name}
            </h2>
            <p className="text-base font-semibold text-white/95">
              {person.relationship}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <p
            className="mb-5 flex items-start gap-2 rounded-xl border-l-4 border-ochre bg-ochre-soft px-4 py-3 text-sm leading-relaxed text-ink"
            role="note"
          >
            <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-ochre-deep" aria-hidden="true" />
            <span>
              <strong>Saved for good —</strong> once a person's details are
              saved they cannot be changed. This applies to everyone in your
              circle.
            </span>
          </p>

          <section aria-label="How you know them">
            <h3 className="mb-2 flex items-center gap-2 font-heading text-xl text-ink">
              <HeartIcon className="h-5 w-5 text-terracotta" />
              How you know {person.name}
            </h3>
            <p className="text-lg leading-relaxed text-ink">{person.bio}</p>
          </section>

          <dl className="mt-6 grid gap-4 rounded-2xl bg-sand p-5 sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                <CalendarIcon className="h-4 w-4" />
                Last time you met
              </dt>
              <dd className="mt-1.5 text-base leading-snug text-ink">
                {person.lastMet}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                <HeartIcon className="h-4 w-4" />
                They love
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {person.loves.map((love) => (
                  <span key={love} className="chip">
                    {love}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <div
            className="mt-6 rounded-2xl border-l-8 border-ochre bg-ochre-soft p-5"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ochre-deep">
              <SparkleIcon className="h-4 w-4" />
              Something to say
            </p>
            <p className="mt-2 text-lg leading-relaxed text-ink">
              {person.conversationStarter}
            </p>
          </div>

          <section className="mt-7" aria-labelledby="photos-together-heading">
            <h3
              id="photos-together-heading"
              className="font-heading text-xl text-ink"
            >
              Photographs together
            </h3>
            <ul className="mt-3 flex flex-wrap gap-4">
              {savedPersonPhotos.map((m) => (
                <li key={m.id} className="w-24">
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        src: m.photoDataUrl ?? null,
                        label: `A saved photo of ${person.name}`,
                        caption: m.caption,
                      })
                    }
                    className="group w-full cursor-pointer rounded-xl text-left transition-transform duration-150 ease-out focus-visible:-translate-y-0.5 active:scale-95"
                    aria-label={`View a large preview of a saved photo: ${m.caption}`}
                  >
                    <img
                      src={m.photoDataUrl ?? undefined}
                      alt={`A saved photo of ${person.name}: ${m.caption}`}
                      className="aspect-square w-24 rounded-xl object-cover shadow-sm ring-1 ring-border transition-shadow duration-150 group-hover:shadow-md"
                    />
                    <p className="mt-1.5 text-center text-xs leading-tight text-ink-soft">
                      {m.caption.length > 18 ? `${m.caption.slice(0, 16)}…` : m.caption}
                    </p>
                  </button>
                </li>
              ))}
              {person.photos.map((photo) => (
                <li key={photo.label} className="w-24">
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        gradient: photo.gradient,
                        label: photo.label,
                      })
                    }
                    className="group w-full cursor-pointer rounded-xl text-left transition-transform duration-150 ease-out focus-visible:-translate-y-0.5 active:scale-95"
                    aria-label={`View a large preview of ${photo.label}`}
                  >
                    <div
                      className="relative flex aspect-square w-24 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-border transition-shadow duration-150 group-hover:shadow-md"
                      style={{ background: photo.gradient }}
                      role="img"
                      aria-label={photo.label}
                    >
                      <ImageIcon className="h-8 w-8 text-white/85" />
                    </div>
                    <p className="mt-1.5 text-center text-xs leading-tight text-ink-soft">
                      {photo.label}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {lightbox && <Lightbox content={lightbox} onClose={() => setLightbox(null)} />}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onToggleReading}
              className="btn-primary flex-1"
              aria-pressed={reading}
            >
              {reading ? (
                <span className="flex items-center gap-2">
                  <span className="flex items-end gap-0.5" aria-hidden="true">
                    <span className="speak-bar" style={{ animationDelay: "0ms" }} />
                    <span className="speak-bar" style={{ animationDelay: "160ms" }} />
                    <span className="speak-bar" style={{ animationDelay: "320ms" }} />
                  </span>
                  Reading aloud… tap to stop
                </span>
              ) : (
                <>
                  <VolumeIcon className="h-6 w-6" />
                  Read this aloud
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary flex-1"
            >
              <RepeatIcon className="h-5 w-5" />
              Try another photo
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

/**
 * The edit option on a person's card: give them a photograph of their own,
 * chosen from the device, the same way a story gets its picture.
 * Sending null takes it away again and brings the drawn stand-in back.
 */
function PersonPhotoEditor({
  person,
  onCancel,
  onSaved,
}: {
  person: Person;
  onCancel: () => void;
  onSaved: (saved: Person) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(person.photoDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unchanged = photo === (person.photoDataUrl ?? null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await updatePersonPhoto(person.id, photo);
      onSaved(saved);
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label={`Edit ${person.name}'s photograph`}
    >
      <p className="text-base font-bold text-ink">
        A photograph of {person.name}
      </p>
      <p className="mt-0.5 text-sm text-ink-soft">
        Pick one from your files — it stands in for the initials wherever they
        appear.
      </p>

      <PhotoPicker
        photo={photo}
        gradient={person.gradient}
        initials={person.initials}
        onChange={setPhoto}
        onError={setError}
      />

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || unchanged}
        >
          <CheckIcon className="h-5 w-5" />
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </section>
  );
}

type LightboxContent =
  | { src: string | null; label: string; caption?: string; actionLabel?: string; onAction?: () => void }
  | { gradient: string; label: string; caption?: string; actionLabel?: string; onAction?: () => void };

/** Large, zoomed-in preview of a photo with a blurred backdrop. */
function Lightbox({
  content,
  onClose,
}: {
  content: LightboxContent;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Remember what opened the lightbox so we can return focus on close.
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
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
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

  const isPhoto = "src" in content;

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
        aria-label={content.label}
        className="animate-lightbox-in w-full max-w-xl overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border"
        style={{ maxHeight: "min(85vh, 640px)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 sm:px-6">
          <p className="truncate font-heading text-xl text-ink">{content.label}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 px-3 py-1.5"
            aria-label="Close photo preview"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {isPhoto ? (
          <div className="flex max-h-[60vh] items-center justify-center bg-black/5 p-4 sm:p-6">
            <img
              src={content.src ?? undefined}
              alt={content.caption || content.label}
              className="max-h-[58vh] w-auto max-w-full rounded-2xl object-contain shadow-md"
            />
          </div>
        ) : (
          <div
            className="m-4 flex aspect-[4/3] items-center justify-center rounded-2xl sm:m-6"
            style={{ background: content.gradient }}
            role="img"
            aria-label={content.label}
          >
            <ImageIcon className="h-16 w-16 text-white/85 sm:h-20 sm:w-20" />
          </div>
        )}

        {(content.caption || content.actionLabel) && (
          <div className="border-t border-border px-5 py-4 sm:px-6">
            {content.caption && <p className="text-base text-ink-soft">{content.caption}</p>}
            {content.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  content.onAction?.();
                }}
                className="btn-primary mt-3 w-full"
              >
                {content.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    // Portal to <body> so the backdrop covers the whole viewport: inside the
    // page, animated ancestors (.animate-fade-up) keep a transform after
    // playback, which would become the containing block for this fixed
    // overlay and trap it to the card area instead of the screen.
    document.body,
  );
}
