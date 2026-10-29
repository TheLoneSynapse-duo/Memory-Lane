/** The day's planned events and what is coming up. */
import { Router } from "express";
import { HttpError, text } from "../http.js";
import { mutate, readDb } from "../store.js";

const router = Router();

/** GET /api/events/today — the events the day started with, before edits. */
router.get("/today", (req, res) => {
  res.json(readDb().defaultTodayEvents);
});

/**
 * GET /api/events/upcoming — events already waiting around the corner.
 *
 * Entries the companion took off are kept but not shown: it hides rather than
 * deletes, so the entry can be put back and a family member can still read what
 * happened in GET /api/schedule/changes.
 */
router.get("/upcoming", (req, res) => {
  res.json(readDb().upcomingEvents.filter((event) => !event.hidden));
});

/**
 * PATCH /api/events/upcoming/:id — rewrite one entry in "Coming up".
 *
 * The day is still a friendly word ("Tomorrow", "Wednesday") rather than a
 * date, so it is kept exactly as the user typed it.
 */
router.patch("/upcoming/:id", (req, res) => {
  const body = req.body ?? {};
  const title = text(body.title, { field: "title", max: 120 });
  if (!title) throw new HttpError(400, '"title" is required — what is coming up?');

  const day = text(body.day, { field: "day", max: 40 }) || "Soon";

  const updated = mutate((db) => {
    const index = db.upcomingEvents.findIndex((e) => e.id === req.params.id);
    if (index === -1) return null;
    const next = { ...db.upcomingEvents[index], day, title };
    db.upcomingEvents[index] = next;
    return next;
  });

  if (!updated) {
    throw new HttpError(404, `No upcoming event with id "${req.params.id}".`);
  }
  res.json(updated);
});

/**
 * DELETE /api/events/upcoming/:id — take an entry out of "Coming up".
 *
 * Unlike today's schedule there is no change log here: the list is the user's
 * own, and taking something off it simply means it is gone.
 */
router.delete("/upcoming/:id", (req, res) => {
  const removed = mutate((db) => {
    const index = db.upcomingEvents.findIndex((e) => e.id === req.params.id);
    if (index === -1) return null;
    const [event] = db.upcomingEvents.splice(index, 1);
    return event;
  });

  if (!removed) {
    throw new HttpError(404, `No upcoming event with id "${req.params.id}".`);
  }
  res.json({ removed: removed.id, title: removed.title });
});

export default router;
