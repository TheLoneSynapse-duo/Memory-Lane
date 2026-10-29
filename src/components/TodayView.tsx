import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError } from "../data/api";
import { reloadPeople, usePeopleState, matchPersonByText, type Person } from "../data/people";
import {
  reloadUpcomingEvents,
  removeUpcomingEvent,
  updateUpcomingEvent,
  useUpcomingEventsState,
  type UpcomingEvent,
} from "../data/events";
import { reloadSchedule, useScheduleState, removeScheduleEvent } from "../data/scheduleStore";
import DataNotice from "./DataNotice";
import ScheduleEditor from "./ScheduleEditor";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

const iconBtnClass =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-ink-soft ring-1 ring-border transition-colors duration-150 hover:bg-sand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-95";

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/70 shadow-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** The local calendar day as "YYYY-MM-DD". */
function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** "Tomorrow", "Wednesday", "3 Oct" — however a date is worth saying aloud. */
function dayLabel(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${iso}T00:00:00`);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function TodayView() {
  const scheduleState = useScheduleState();
  const peopleState = usePeopleState();
  const upcomingState = useUpcomingEventsState();

  const events = scheduleState.data;
  const upcoming = upcomingState.data;
  const [editorOpen, setEditorOpen] = useState(false);
  /** The schedule event the editor should open straight onto, if any. */
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  /** The "Coming up" row being rewritten, or null. */
  const [editingUpcomingId, setEditingUpcomingId] = useState<string | null>(null);
  /** "Remove?" is a two-step confirm: this holds the row waiting for it. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const todayKey = todayIso();
  // Anything dated ahead belongs under "Coming up"; an undated event (or one
  // written before dates existed) is part of today.
  const todayEvents = events.filter((event) => !event.date || event.date <= todayKey);
  const futureEvents = events
    .filter((event) => event.date && event.date > todayKey)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

  function askRemove(key: string) {
    setActionError(null);
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmId(key);
    confirmTimerRef.current = window.setTimeout(() => setConfirmId(null), 4000);
  }

  function clearConfirm() {
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    setConfirmId(null);
  }

  async function handleRemoveUpcoming(id: string) {
    setActionError(null);
    try {
      await removeUpcomingEvent(id);
    } catch (error) {
      setActionError(describeError(error));
    }
    clearConfirm();
  }

  async function handleRemoveScheduleEvent(id: string) {
    setActionError(null);
    try {
      await removeScheduleEvent(id);
    } catch (error) {
      setActionError(describeError(error));
    }
    clearConfirm();
  }

  function openEditorFor(id: string | null) {
    setEditingEventId(id);
    setEditorOpen(true);
  }

  const findPerson = (id: string): Person | undefined =>
    peopleState.data.find((person) => person.id === id);

  /**
   * The face a plan wears: whoever the event is linked to, or — for an event
   * saved before it carried a link — whoever its own wording names, which is
   * how "meeting with a friend" earns the same box as any other plan.
   */
  const contactFor = (personId: string, ...words: (string | undefined)[]): Person | undefined =>
    findPerson(personId) ?? matchPersonByText(...words);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-6">
      <header className="animate-fade-up">
        <p className="kicker">Today</p>
        <h1 className="mt-2 font-heading text-4xl text-ink">{dateLabel}</h1>
        <p className="mt-2 text-lg leading-relaxed text-ink-soft">
          Here is your day at a glance — and what is already waiting around the corner.
        </p>
      </header>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl text-ink">Today</h2>
        <button
          type="button"
          onClick={() => openEditorFor(null)}
          className="btn-secondary"
          aria-haspopup="dialog"
        >
          <PencilIcon className="h-5 w-5" />
          Edit schedule
        </button>
      </div>

      {scheduleState.status !== "ready" ? (
        <DataNotice
          state={scheduleState}
          loadingMessage="Looking up your day…"
          onRetry={reloadSchedule}
          className="mt-4"
        />
      ) : todayEvents.length === 0 ? (
        <div className="animate-fade-up mt-4 rounded-2xl border border-dashed border-border bg-sand px-5 py-10 text-center">
          <p className="font-heading text-xl text-ink">A wide-open day</p>
          <p className="mt-1 text-lg text-ink-soft">
            Nothing planned yet — add a moment to look forward to.
          </p>
          <button
            type="button"
            onClick={() => openEditorFor(null)}
            className="btn-primary mt-5"
          >
            <PlusIcon className="h-5 w-5" />
            Add an event
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {todayEvents.map((event, i) => {
            // The card is the same box for every event: time and headline,
            // whatever detail was written, and the contact chip when the plan
            // belongs to someone in the circle.
            const person = contactFor(event.personId, event.headline, event.description);
            return (
              <article
                key={event.id}
                className="animate-fade-up rounded-2xl border border-border bg-card p-5 shadow-sm"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time
                    dateTime={event.time}
                    className="font-heading text-2xl font-semibold text-terracotta"
                  >
                    {event.time}
                  </time>
                  <h3 className="font-heading text-xl text-ink">{event.headline}</h3>
                </div>
                {event.description && (
                  <p className="mt-2 text-lg text-ink-soft">{event.description}</p>
                )}
                {person && (
                  <div className={event.description ? "mt-4" : "mt-3"}>
                    <PersonChip person={person} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mt-10 font-heading text-2xl text-ink">Coming up</h2>
      {actionError && (
        <p
          role="alert"
          className="mt-3 rounded-2xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink"
        >
          {actionError}
        </p>
      )}
      {upcomingState.status !== "ready" ? (
        <DataNotice
          state={upcomingState}
          loadingMessage="Looking ahead to what's coming…"
          onRetry={reloadUpcomingEvents}
          className="mt-4"
        />
      ) : futureEvents.length === 0 && upcoming.length === 0 ? (
        <div className="animate-fade-up mt-4 rounded-2xl border border-dashed border-border bg-sand px-5 py-8 text-center">
          <p className="text-lg text-ink-soft">
            Nothing on the horizon yet — give an event a date and it will wait
            for you here.
          </p>
          <button
            type="button"
            onClick={() => openEditorFor(null)}
            className="btn-secondary mt-4"
          >
            <PlusIcon className="h-5 w-5" />
            Plan something
          </button>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {/* Dated events from the schedule: open straight in the editor. */}
          {futureEvents.map((event, index) => (
            <li
              key={event.id}
              className="animate-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ochre-soft px-4 py-3"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <span className="text-sm font-bold uppercase tracking-wider text-ochre-deep">
                {dayLabel(event.date!)}
              </span>
              <span aria-hidden="true" className="text-ochre-deep/70">
                ·
              </span>
              <p className="font-semibold text-ink">
                {event.headline}
                {event.time !== "Anytime" && (
                  <span className="ml-2 text-base font-normal text-ink-soft">
                    at {event.time}
                  </span>
                )}
              </p>
              <ContactTag person={contactFor(event.personId, event.headline, event.description)} />
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditorFor(event.id)}
                  className={iconBtnClass}
                  aria-label={`Change ${event.headline}`}
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                {confirmId === event.id ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveScheduleEvent(event.id)}
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
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </span>
            </li>
          ))}

          {upcoming.map((event, index) =>
            editingUpcomingId === event.id ? (
              <UpcomingRowEditor
                key={`edit-${event.id}`}
                event={event}
                onCancel={() => setEditingUpcomingId(null)}
                onSaved={() => setEditingUpcomingId(null)}
                onError={setActionError}
              />
            ) : (
              <li
                key={event.id}
                className="animate-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ochre-soft px-4 py-3"
                style={{ animationDelay: `${(futureEvents.length + index) * 90}ms` }}
              >
                <span className="text-sm font-bold uppercase tracking-wider text-ochre-deep">
                  {event.day}
                </span>
                <span aria-hidden="true" className="text-ochre-deep/70">
                  ·
                </span>
                <p className="font-semibold text-ink">{event.title}</p>
                <span className="ml-auto flex items-center gap-2">
                  <ContactTag person={contactFor(event.personId, event.title)} />
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setEditingUpcomingId(event.id);
                    }}
                    className={iconBtnClass}
                    aria-label={`Change ${event.title}`}
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  {confirmId === event.id ? (
                    <button
                      type="button"
                      onClick={() => void handleRemoveUpcoming(event.id)}
                      className="min-w-[5.5rem] shrink-0 cursor-pointer rounded-full bg-destructive px-3 py-1.5 text-sm font-bold text-white transition-transform duration-150 ease-out active:scale-95"
                      aria-label={`Confirm removing ${event.title}`}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askRemove(event.id)}
                      className={iconBtnClass}
                      aria-label={`Remove ${event.title}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </span>
              </li>
            )
          )}
        </ul>
      )}

      {peopleState.status === "error" && (
        <DataNotice state={peopleState} onRetry={reloadPeople} className="mt-6" />
      )}

      {editorOpen && (
        <ScheduleEditor
          editingId={editingEventId}
          onClose={() => {
            setEditorOpen(false);
            setEditingEventId(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * One "Coming up" row in rewrite mode: the day and the title, the two things
 * that row is made of.
 */
function UpcomingRowEditor({
  event,
  onCancel,
  onSaved,
  onError,
}: {
  event: UpcomingEvent;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [day, setDay] = useState(event.day);
  const [title, setTitle] = useState(event.title);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      onError("What's coming up? Give it a title.");
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    onError(null);
    try {
      await updateUpcomingEvent(event.id, { day, title });
      onSaved();
    } catch (error) {
      onError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="animate-fade-up rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
      <form onSubmit={handleSave} className="space-y-3" noValidate>
        <div>
          <label
            htmlFor={`upcoming-day-${event.id}`}
            className="block text-base font-bold text-ink"
          >
            When?
          </label>
          <input
            id={`upcoming-day-${event.id}`}
            type="text"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            maxLength={40}
            placeholder="e.g. Tomorrow, Wednesday, 5 October"
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div>
          <label
            htmlFor={`upcoming-title-${event.id}`}
            className="block text-base font-bold text-ink"
          >
            What's happening?
          </label>
          <input
            id={`upcoming-title-${event.id}`}
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Ellen's telephone call"
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            <CheckIcon className="h-5 w-5" />
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost"
            disabled={saving}
          >
            <CloseIcon className="h-5 w-5" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

function PersonChip({ person }: { person: Person | undefined }) {
  if (!person) return null;
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full bg-sand py-1 pl-1 pr-3.5">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: person.gradient }}
        aria-hidden="true"
      >
        {person.initials}
      </span>
      <span className="text-base leading-tight">
        <strong className="font-bold text-ink">{person.name}</strong>
        <span className="text-ink-soft"> · {person.relationship}</span>
      </span>
    </span>
  );
}

/** The smaller face-and-name tag, for the compact rows under "Coming up". */
function ContactTag({ person }: { person: Person | undefined }) {
  if (!person) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-base text-ink-soft">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: person.gradient }}
        aria-hidden="true"
      >
        {person.initials}
      </span>
      {person.name}
    </span>
  );
}
