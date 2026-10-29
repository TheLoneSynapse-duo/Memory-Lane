/**
 * Today's schedule.
 *
 * The day the user starts with comes from the seed; every rewrite, addition and
 * removal they make is stored alongside it, so the changed day survives a
 * reload exactly as it did in the app's localStorage.
 */
import { Router } from "express";
import { HttpError, text } from "../http.js";
import { matchPersonId, mergeTodayEvents, mutate, readDb, recordScheduleChange } from "../store.js";

const router = Router();

function newId() {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Builds a schedule event from the editor's fields.
 *
 * `date` is the day it belongs to ("YYYY-MM-DD"). An empty date means today —
 * which is how every event stored before the date field existed reads, so old
 * days keep working untouched.
 *
 * `personId` decides who the card's contact chip is: an explicit choice from
 * the editor wins (an empty string means nobody, deliberately), and a request
 * that carries no choice at all — the companion saying "meeting with Frank" —
 * is linked to whoever the wording names. Otherwise the event keeps whoever it
 * was already linked to.
 */
function toEvent(id, body, previous) {
  const date = text(body.date, { field: "date", max: 40 });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, '"date" must look like 2026-09-30.');
  }

  const headline = text(body.headline, { field: "headline", max: 120 });
  const description = text(body.description, { field: "description", max: 400 });
  const database = readDb();

  const requested = typeof body.personId === "string" ? body.personId.trim() : undefined;
  const personId =
    requested === undefined
      ? matchPersonId(database, headline, description) || previous?.personId || ""
      : database.people.some((person) => person.id === requested)
        ? requested
        : "";

  return {
    id,
    time: text(body.time, { field: "time", max: 40 }) || "Anytime",
    headline,
    description,
    date,
    personId,
  };
}

/** GET /api/schedule — today as it stands right now. */
router.get("/", (req, res) => {
  res.json(mergeTodayEvents());
});

/**
 * GET /api/schedule/changes — what was moved or taken off, newest first.
 *
 * This is the record a family member reads: it says what the day used to be,
 * what it became, who changed it and whether a reason was given. Nothing in it
 * is ever pruned.
 */
router.get("/changes", (req, res) => {
  const changes = readDb().schedule.changes ?? [];
  res.json({ count: changes.length, changes: changes.slice(0, 100) });
});

/** POST /api/schedule/events — add a moment to today. */
router.post("/events", (req, res) => {
  const body = req.body ?? {};
  const event = toEvent(newId(), body);
  if (!event.headline) throw new HttpError(400, '"headline" is required.');

  mutate((db) => {
    db.schedule.events[event.id] = event;
  });

  res.status(201).json(event);
});

/** PATCH /api/schedule/events/:id — rewrite an event, default or added. */
router.patch("/events/:id", (req, res) => {
  const body = req.body ?? {};
  const headline = text(body.headline, { field: "headline", max: 120 });
  if (!headline) throw new HttpError(400, '"headline" is required.');

  const updated = mutate((db) => {
    const previous =
      db.schedule.events[req.params.id] ??
      db.defaultTodayEvents.find((e) => e.id === req.params.id);
    if (!previous) return null;

    const event = { ...toEvent(req.params.id, body, previous), headline };
    db.schedule.events[req.params.id] = event;
    return event;
  });

  if (!updated) throw new HttpError(404, `No event with id "${req.params.id}".`);
  res.json(updated);
});

/** DELETE /api/schedule/events/:id — clear a moment out of the day. */
router.delete("/events/:id", (req, res) => {
  const removed = mutate((db) => {
    const isDefault = db.defaultTodayEvents.some((e) => e.id === req.params.id);
    const hadCustom = Object.hasOwn(db.schedule.events, req.params.id);
    if (!isDefault && !hadCustom) return false;

    // Snapshot it before it goes: taking something off the screen should not
    // take it out of the record.
    const event =
      db.schedule.events[req.params.id] ??
      db.defaultTodayEvents.find((e) => e.id === req.params.id);

    delete db.schedule.events[req.params.id];
    if (isDefault && !db.schedule.removedIds.includes(req.params.id)) {
      db.schedule.removedIds.push(req.params.id);
    }
    if (event) {
      recordScheduleChange(db, {
        by: "person",
        action: "cancelled",
        eventId: req.params.id,
        headline: event.headline,
        before: { time: event.time, headline: event.headline, description: event.description },
        after: null,
        reason: "",
      });
    }
    return true;
  });

  if (!removed) throw new HttpError(404, `No event with id "${req.params.id}".`);
  res.status(204).end();
});

export default router;
