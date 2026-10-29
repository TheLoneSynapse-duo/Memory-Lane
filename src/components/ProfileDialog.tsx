import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { initials, saveProfile, useProfile } from "../data/profile";
import { CheckIcon, CloseIcon } from "./icons";

/**
 * Personal details, kept in one dialog that is reachable from every screen:
 * the name the app opens with, what it should call them, and a line about
 * them. Kept on the device for the greeting, and with the service so the
 * companion knows their name too.
 */
export default function ProfileDialog({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [preferredName, setPreferredName] = useState(profile.preferredName);
  const [about, setAbout] = useState(profile.about);
  const [saved, setSaved] = useState(false);

  const dialogRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // Hand focus to the dialog and back to whatever opened it on close.
  useEffect(() => {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      lastTriggerRef.current?.focus();
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
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

  const cleanName = name.trim();
  const cleanPreferred = preferredName.trim();
  const unchanged =
    cleanName === profile.name &&
    cleanPreferred === profile.preferredName &&
    about.trim() === profile.about;

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!cleanName) {
      nameRef.current?.focus();
      return;
    }
    saveProfile({
      name: cleanName,
      preferredName: cleanPreferred,
      about: about.trim(),
    });
    setSaved(true);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSaved(false), 2600);
  }

  const fieldClass =
    "mt-2 w-full rounded-2xl border-2 border-sand-deep bg-card p-3.5 text-lg leading-snug text-ink shadow-xs placeholder:text-ink-soft/70 focus:border-terracotta focus:outline-none";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <form
        onSubmit={handleSave}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        className="animate-lightbox-in w-full max-w-lg overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border"
        style={{ maxHeight: "min(90vh, 720px)" }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border bg-sand/70 px-6 py-5">
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-heading text-xl font-extrabold text-white shadow-md"
              style={{
                background: "linear-gradient(135deg, #0f6f63 0%, #0a544a 100%)",
              }}
              aria-hidden="true"
            >
              {initials(profile)}
            </span>
            <div>
              <p className="kicker">Personal details</p>
              <h2 id="profile-dialog-title" className="mt-1 font-heading text-2xl">
                About you
              </h2>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 !px-3 !py-2"
            aria-label="Close personal details"
          >
            <CloseIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-6">
          <div>
            <label htmlFor="profile-name" className="block text-base font-bold text-ink">
              Your name
            </label>
            <input
              id="profile-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Margaret Hale"
              autoComplete="name"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="profile-preferred" className="block text-base font-bold text-ink">
              What should the app call you?{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id="profile-preferred"
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Maggie"
              className={fieldClass}
            />
            <p className="mt-1.5 text-sm text-ink-soft">
              This is the word in &ldquo;Hello, ___&rdquo; at the top of Home.
            </p>
          </div>

          <div>
            <label htmlFor="profile-about" className="block text-base font-bold text-ink">
              A line about you{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <textarea
              id="profile-about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={3}
              maxLength={240}
              placeholder="e.g. Retired teacher, granddad of four, still bowls on Tuesdays."
              className={`${fieldClass} resize-y`}
            />
          </div>

          {!cleanName && (
            <p role="alert" className="rounded-2xl border border-ochre bg-ochre-soft p-4 text-base text-ink">
              Add a name so the app knows how to greet you.
            </p>
          )}

          <p className="text-sm text-ink-soft">
            Kept with your memories and used by your companion, so it knows who
            it is talking to. It is never shared beyond this app.
          </p>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-5">
          <button type="submit" className="btn-primary" disabled={unchanged}>
            <CheckIcon className="h-5 w-5" />
            Save details
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            {saved ? "Done" : "Cancel"}
          </button>
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-bold text-sage-deep"
          >
            {saved && "Saved ✓"}
          </p>
        </footer>
      </form>
    </div>,
    document.body
  );
}
