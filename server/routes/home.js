/** Content for the home screen: the day's reflection and the moments worth keeping. */
import { Router } from "express";
import { HttpError, asyncHandler, optionalImageDataUrl, text } from "../http.js";
import { memoryOfTheDay, mutate, readDb, resetDb } from "../store.js";

const router = Router();

/**
 * GET /api/home — memory of the day plus the list of moments worth keeping.
 * With no moments left, memory of the day is simply null: an empty shelf is a
 * real answer, not an error.
 */
router.get("/", (req, res) => {
  const { moments } = readDb().home;
  res.json({ memoryOfTheDay: memoryOfTheDay(moments), moments, generatedAt: new Date().toISOString() });
});

/** POST /api/home/moments — the Memories screen's "Add a memory". */
router.post("/moments", (req, res) => {
  const body = req.body ?? {};
  const title = text(body.title, { field: "title", max: 80 });
  if (!title) throw new HttpError(400, "A moment needs a name — what would you call it?");
  const content = text(body.text, { field: "text", max: 600 });
  if (!content) {
    throw new HttpError(400, "Write a few lines about the moment, so it can be kept.");
  }

  const moment = {
    id: `moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    text: content,
    photoDataUrl: optionalImageDataUrl(body.photoDataUrl),
  };

  mutate((db) => {
    db.home.moments = [...db.home.moments, moment];
  });

  res.status(201).json(moment);
});

/** PATCH /api/home/moments/:id — the Memories screen's edit form. */
router.patch("/moments/:id", (req, res) => {
  const body = req.body ?? {};
  const changes = {};
  if (body.title !== undefined) {
    changes.title = text(body.title, { field: "title", max: 80 });
    if (!changes.title) throw new HttpError(400, "A moment needs a name — what would you call it?");
  }
  if (body.text !== undefined) {
    changes.text = text(body.text, { field: "text", max: 600 });
    if (!changes.text) {
      throw new HttpError(400, "Write a few lines about the moment, so it can be kept.");
    }
  }
  if (body.photoDataUrl !== undefined) {
    // null puts the moment back to words only.
    changes.photoDataUrl = optionalImageDataUrl(body.photoDataUrl);
  }

  const updated = mutate((db) => {
    const index = db.home.moments.findIndex((m) => m.id === req.params.id);
    if (index === -1) return null;
    const next = { ...db.home.moments[index], ...changes, id: db.home.moments[index].id };
    db.home.moments[index] = next;
    return next;
  });

  if (!updated) throw new HttpError(404, `No moment with id "${req.params.id}".`);
  res.json(updated);
});

/** DELETE /api/home/moments/:id — taking a moment off the list. */
router.delete("/moments/:id", (req, res) => {
  const removed = mutate((db) => {
    const before = db.home.moments.length;
    db.home.moments = db.home.moments.filter((m) => m.id !== req.params.id);
    return before !== db.home.moments.length;
  });

  if (!removed) throw new HttpError(404, `No moment with id "${req.params.id}".`);
  res.status(204).end();
});

/** POST /api/home/reset — clears this account back to its initial empty state. */
router.post(
  "/reset",
  asyncHandler(async (req, res) => {
    resetDb();
    res.json({ ok: true, message: "The account has been cleared to its initial empty state." });
  })
);

export default router;
