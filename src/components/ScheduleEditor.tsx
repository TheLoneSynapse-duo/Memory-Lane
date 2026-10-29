import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { describeError } from "../data/api";
import type { TodayEvent } from "../data/events";
import { matchPersonByText, usePeopleState } from "../data/people";
import {
  addScheduleEvent,
  reloadSchedule,
  removeScheduleEvent,
  updateScheduleEvent,
  useScheduleState,
  type ScheduleEventInput,
} from "../data/scheduleStore";
import {
  CheckIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/70 shadow-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const iconBtnClass =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-ink-soft ring-1 ring-border transition-colors duration-150 hover:bg-sand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-95";

/** The local calendar day as "YYYY-MM-DD" — the empty option means today. */
function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * A calm, full-screen dialog for adding to — or rewriting — today's
 * schedule. Portaled to <body> so the fixed backdrop covers the whole
 * viewport and the tab trap works cleanly.
 */
export default function ScheduleEditor({
  onClose,
  editingId = null,
}: {
  onClose: () => void;
  /** Open straight onto this event's details (used by "Coming up"). */
  editingId?: string | null;
}) {
  const scheduleState = useScheduleState();
  const events = scheduleState.data;

  const [editing, setEditing] = useState<{ id: string } | null>(
    editingId ? { id: editingId } : null
  );
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

  function startEditing(event: TodayEvent) {
    setEditing({ id: event.id });
    setConfirmRemoveId(null);
    setError(null);
  }

  async function handleSave(input: ScheduleEventInput) {
    setSaving(true);
    setError(null);
    try {
      if (editing && editing.id !== "new") {
        await updateScheduleEvent(editing.id, input);
      } else {
        await addScheduleEvent(input);
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
      await removeScheduleEvent(id);
    } catch (removeError) {
      setError(describeError(removeError));
    }
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveId(null);
  }

  const editingEvent =
    editing && editing.id !== "new"
      ? events.find((event) => event.id === editing.id)
      : undefined;

  // How much of the list is today's, and how much has been given another day.
  const todayCount = events.filter(
    (event) => !event.date || event.date === todayIso()
  ).length;
  const aheadCount = events.length - todayCount;

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
        aria-label="Edit today's schedule"
        className="animate-lightbox-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 sm:px-6">
          <h2 className="truncate font-heading text-xl text-ink">
            Your day&rsquo;s schedule
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 px-3 py-1.5"
            aria-label="Close schedule editor"
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
              Saved — your day is updated.
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

          {scheduleState.status !== "ready" ? (
            <p role="status" className="mt-3 text-lg text-ink-soft">
              {scheduleState.status === "error"
                ? scheduleState.error
                : "Looking up your day…"}
              {scheduleState.status === "error" && (
                <button
                  type="button"
                  onClick={() => void reloadSchedule()}
                  className="btn-secondary mt-4 block"
                >
                  Try again
                </button>
              )}
            </p>
          ) : editing ? (
            <EventForm
              key={editing.id}
              initial={editingEvent}
              saving={saving}
              onSave={handleSave}
              onCancel={() => {
                setEditing(null);
                closeRef.current?.focus();
              }}
            />
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-sand px-5 py-10 text-center">
              <p className="font-heading text-xl text-ink">Your schedule is wide open</p>
              <p className="mt-1 text-lg text-ink-soft">
                Add a moment to look forward to.
              </p>
              <button type="button" onClick={startAdding} className="btn-primary mt-5">
                <PlusIcon className="h-5 w-5" />
                Add an event
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">
                  {todayCount} {todayCount === 1 ? "event" : "events"} today
                  {aheadCount > 0 && (
                    <>
                      {" "}
                      · {aheadCount} {aheadCount === 1 ? "date" : "dates"} ahead
                    </>
                  )}
                </p>
                <button type="button" onClick={startAdding} className="btn-ghost">
                  <PlusIcon className="h-5 w-5" />
                  Add event
                </button>
              </div>
              <ul className="mt-3 space-y-3">
                {events.map((event, i) => {
                  const isAway = Boolean(event.date) && event.date !== todayIso();
                  return (
                    <li
                      key={event.id}
                      className="animate-fade-up flex items-center gap-3 rounded-2xl bg-sand p-3"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="w-20 shrink-0 font-heading text-lg font-semibold text-terracotta">
                        {event.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-lg text-ink">
                          {event.headline}
                        </p>
                        <p className="truncate text-base text-ink-soft">
                          {event.description || ""}
                          {event.description && isAway && " · "}
                          {isAway && (
                            <span className="font-semibold text-ochre-deep">
                              {new Date(`${event.date}T00:00:00`).toLocaleDateString(
                                undefined,
                                { weekday: "short", day: "numeric", month: "short" }
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditing(event)}
                        className={iconBtnClass}
                        aria-label={`Rewrite ${event.headline}`}
                      >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    {confirmRemoveId === event.id ? (
                      <button
                        type="button"
                        onClick={() => void handleRemove(event.id)}
                        className="min-w-[5.5rem] shrink-0 cursor-pointer rounded-full bg-destructive px-3 py-1.5 text-sm font-bold text-white transition-transform duration-150 ease-out active:scale-95"
                        aria-label={`Confirm removing ${event.headline}`}
                      >
                        Remove?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => askRemove(event.id)}
                        className={iconBtnClass}
                        aria-label={`Remove ${event.headline}`}
                      >                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                  </li>
                  );
                })}
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

function EventForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: TodayEvent | undefined;
  saving: boolean;
  onSave: (input: ScheduleEventInput) => void;
  onCancel: () => void;
}) {
  const [time, setTime] = useState(initial && initial.time !== "Anytime" ? initial.time : "");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const people = usePeopleState().data;

  // Who wears the contact chip on the card. It starts from the event's own
  // link, or from whoever the wording already names — so "meeting with Frank"
  // arrives with Frank already picked — and follows the wording until they
  // choose for themselves.
  const [personId, setPersonId] = useState(
    () => initial?.personId || matchPersonByText(initial?.headline, initial?.description)?.id || ""
  );
  const [personTouched, setPersonTouched] = useState(false);
  // A link that came from the wording keeps following the wording; a hand-picked
  // one stays put, however the words are rewritten.
  const wordingLinked =
    Boolean(initial?.personId) &&
    initial?.personId === matchPersonByText(initial?.headline, initial?.description)?.id;

  useEffect(() => {
    if (personTouched) return;
    const named = matchPersonByText(headline, description);
    if (named) setPersonId(named.id);
    else if (!initial?.personId || wordingLinked) setPersonId("");
  }, [headline, description, people, personTouched, initial?.personId, wordingLinked]);

  const [error, setError] = useState<string | null>(null);
  const headlineRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    headlineRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!headline.trim()) {
      setError("Give this moment a short headline — what's happening?");
      headlineRef.current?.focus();
      return;
    }
    setError(null);
    onSave({ time, headline, description, date, personId });
  }

  const forAnotherDay = date !== todayIso();
  const pickedPerson = people.find((person) => person.id === personId);

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="schedule-date" className="block text-base font-bold text-ink">
          Which day?
        </label>
        <input
          id="schedule-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputClass} mt-1.5`}
        />
        <p className="mt-1 text-sm text-ink-soft">
          {forAnotherDay
            ? "It will show up under \u201cComing up\u201d instead of today."
            : "Today by default \u2014 pick another day to plan ahead."}
        </p>
      </div>

      <div>
        <label htmlFor="schedule-time" className="block text-base font-bold text-ink">
          At what time?
        </label>
        <input
          id="schedule-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`${inputClass} mt-1.5`}
        />
        <p className="mt-1 text-sm text-ink-soft">Leave it blank for &ldquo;Anytime&rdquo;.</p>
      </div>

      <div>
        <label
          htmlFor="schedule-headline"
          className="block text-base font-bold text-ink"
        >
          What&rsquo;s happening?
        </label>
        <input
          id="schedule-headline"
          ref={headlineRef}
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Frank comes by for tea"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "schedule-headline-error" : undefined}
          className={`${inputClass} mt-1.5`}
        />
        {error && (
          <p
            id="schedule-headline-error"
            role="alert"
            className="mt-1.5 font-semibold text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="schedule-description"
          className="block text-base font-bold text-ink"
        >
          Any more detail?
        </label>
        <textarea
          id="schedule-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What makes this one worth the moment?"
          className={`${inputClass} mt-1.5 resize-none`}
        />
      </div>

      <div>
        <label htmlFor="schedule-person" className="block text-base font-bold text-ink">
          Who is it with?
        </label>
        <select
          id="schedule-person"
          value={personId}
          onChange={(e) => {
            setPersonTouched(true);
            setPersonId(e.target.value);
          }}
          className={`${inputClass} mt-1.5 cursor-pointer`}
        >
          <option value="">No one in particular — just my own</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.relationship}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-ink-soft">
          {pickedPerson
            ? `${pickedPerson.name} gets the contact chip on the card, just like your other plans.`
            : "Name someone from your contacts in the line above and they will be picked for you."}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          <CheckIcon className="h-5 w-5" />
          {saving
            ? "Saving…"
            : initial
              ? "Save changes"
              : forAnotherDay
                ? "Add to schedule"
                : "Add to today"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
