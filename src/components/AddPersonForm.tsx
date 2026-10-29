import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError } from "../data/api";
import { addPerson, type Person, type PersonInput } from "../data/people";
import PhotoPicker from "./PhotoPicker";
import { CheckIcon, CloseIcon, SparkleIcon } from "./icons";

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/70 shadow-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** The stand-in behind the preview before a new face has a photo of their own. */
const BLANK_GRADIENT = "linear-gradient(135deg, #e5d7c0 0%, #d9c9ae 100%)";

/**
 * The Add option under the circle: one new familiar face — their name, how you
 * know them, a few words, and a picture from your files if they have one.
 * A photograph saved from the camera can be passed in as a starting point.
 */
export default function AddPersonForm({
  onAdded,
  onCancel,
  initialPhoto = null,
  initialName = "",
  heading = "Add a familiar face",
}: {
  /** Called with the face the server saved. */
  onAdded: (person: Person) => void;
  onCancel: () => void;
  /** A photo already kept on the device, used as the starting photograph. */
  initialPhoto?: string | null;
  /** A name already typed when the photo was kept, used as a starting name. */
  initialName?: string;
  heading?: string;
}) {
  const [name, setName] = useState(initialName);
  const [relationship, setRelationship] = useState("");
  const [bio, setBio] = useState("");
  const [lastMet, setLastMet] = useState("");
  const [loves, setLoves] = useState("");
  const [conversationStarter, setConversationStarter] = useState("");
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give them a name — what should the app call them?");
      nameRef.current?.focus();
      return;
    }
    if (!relationship.trim()) {
      setError("How do you know them? — for example, Your granddaughter.");
      return;
    }
    setError(null);
    void save({
      name,
      relationship,
      bio,
      photoDataUrl: photo,
      lastMet,
      // The card shows these as chips, so commas (or new lines) split them up.
      loves: loves
        .split(/[,\n]/)
        .map((love) => love.trim())
        .filter(Boolean),
      conversationStarter,
    });
  }

  async function save(input: PersonInput) {
    setSaving(true);
    try {
      const saved = await addPerson(input);
      onAdded(saved);
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={heading}
      className="animate-fade-up mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <p className="font-heading text-xl text-ink">{heading}</p>
      <p className="mt-0.5 text-sm text-ink-soft">
        A name and how you know them — the rest is up to you.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="new-face-name" className="block text-base font-bold text-ink">
            What are they called?
          </label>
          <input
            id="new-face-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Ruby"
            className={`${inputClass} mt-1.5`}
          />
        </div>

        <div>
          <label
            htmlFor="new-face-relationship"
            className="block text-base font-bold text-ink"
          >
            How do you know them?
          </label>
          <input
            id="new-face-relationship"
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            maxLength={60}
            placeholder="e.g. Your granddaughter"
            className={`${inputClass} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="new-face-bio" className="block text-base font-bold text-ink">
            A few words about them{" "}
            <span className="text-ink-soft">(optional)</span>
          </label>
          <textarea
            id="new-face-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="What you would want to remember about them."
            className={`${inputClass} mt-1.5 resize-none`}
          />
        </div>

        <div>
          <label htmlFor="new-face-lastmet" className="block text-base font-bold text-ink">
            When did you last see them?{" "}
            <span className="text-ink-soft">(optional)</span>
          </label>
          <input
            id="new-face-lastmet"
            type="text"
            value={lastMet}
            onChange={(e) => setLastMet(e.target.value)}
            maxLength={240}
            placeholder="e.g. This morning, at the kitchen table, over tea and toast."
            className={`${inputClass} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="new-face-loves" className="block text-base font-bold text-ink">
            What do they love? <span className="text-ink-soft">(optional)</span>
          </label>
          <input
            id="new-face-loves"
            type="text"
            value={loves}
            onChange={(e) => setLoves(e.target.value)}
            maxLength={300}
            placeholder="e.g. his allotment shed, the river walk, Sunday roasts"
            className={`${inputClass} mt-1.5`}
          />
          <p className="mt-1 text-sm text-ink-soft">
            Separate each one with a comma.
          </p>
        </div>

        <div>
          <label
            htmlFor="new-face-starter"
            className="block text-base font-bold text-ink"
          >
            Something to say about them{" "}
            <span className="text-ink-soft">(optional)</span>
          </label>
          <textarea
            id="new-face-starter"
            value={conversationStarter}
            onChange={(e) => setConversationStarter(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="A gentle nudge for when the conversation runs dry."
            className={`${inputClass} mt-1.5 resize-none`}
          />
        </div>

        <div>
          <p className="text-base font-bold text-ink">Their photograph</p>
          <PhotoPicker
            photo={photo}
            gradient={BLANK_GRADIENT}
            initials={name.trim() ? name.trim()[0].toUpperCase() : "?"}
            onChange={setPhoto}
            onError={setError}
          />
        </div>
      </div>

      <p
        className="mt-4 flex items-start gap-2 rounded-xl border-l-4 border-ochre bg-ochre-soft px-4 py-3 text-sm leading-relaxed text-ink"
        role="note"
      >
        <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-ochre-deep" aria-hidden="true" />
        <span>
          <strong>Please check this over before saving —</strong> once it is
          saved, the information for this person cannot be changed. This applies
          to everyone in your circle.
        </span>
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
        >
          <CheckIcon className="h-5 w-5" />
          {saving ? "Adding…" : "Add to the circle"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          <CloseIcon className="h-5 w-5" aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  );
}
