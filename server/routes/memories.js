/** The memory library: every photo the user captured and kept. */
import { Router } from "express";
import { HttpError, optionalImageDataUrl, shortDate, text } from "../http.js";
import { DESTINATIONS } from "../seed.js";
import { mutate, readDb } from "../store.js";

const router = Router();

function newId() {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Keeps only known destinations, de-duplicated; falls back when nothing is left. */
function normalizeDestinations(value, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    throw new HttpError(400, '"destinations" must be an array of "home", "faces" or "stories".');
  }
  const cleaned = [...new Set(value.filter((id) => DESTINATIONS.includes(id)))];
  return cleaned.length ? cleaned : fallback;
}

/** The caption the camera flow shows when the user does not supply one. */
function buildCaption(name) {
  const base = name ? `A photo with ${name}` : "A new memory";
  return `${base} · ${shortDate()}`;
}

/** GET /api/memories?destination=home|faces|stories */
router.get("/", (req, res) => {
  const { destination } = req.query;
  let list = readDb().memories;

  if (destination !== undefined) {
    if (typeof destination !== "string" || !DESTINATIONS.includes(destination)) {
      throw new HttpError(
        400,
        `"destination" must be one of: ${DESTINATIONS.join(", ")}.`
      );
    }
    list = list.filter((memory) => memory.destinations.includes(destination));
  }

  res.json(list);
});

/** GET /api/memories/:id */
router.get("/:id", (req, res) => {
  const memory = readDb().memories.find((m) => m.id === req.params.id);
  if (!memory) throw new HttpError(404, `No saved memory with id "${req.params.id}".`);
  res.json(memory);
});

/** POST /api/memories — save a photo from the camera (or the device picker). */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, { field: "name", max: 40 });
  const metNote = text(body.metNote, { field: "metNote", max: 280 });
  const caption = text(body.caption, { field: "caption", max: 120, fallback: buildCaption(name) });
  const photoDataUrl = optionalImageDataUrl(body.photoDataUrl);
  const destinations = normalizeDestinations(body.destinations, ["home", "faces"]);

  const card = {
    id: newId(),
    name,
    metNote,
    caption: caption || buildCaption(name),
    createdAt: typeof body.createdAt === "string" && body.createdAt ? body.createdAt : new Date().toISOString(),
    photoDataUrl,
    destinations,
  };

  mutate((db) => {
    db.memories = [card, ...db.memories];
  });

  res.status(201).json(card);
});

/** PATCH /api/memories/:id — the edit form on the library card. */
router.patch("/:id", (req, res) => {
  const body = req.body ?? {};
  const changes = {};

  if (body.name !== undefined) changes.name = text(body.name, { field: "name", max: 40 });
  if (body.metNote !== undefined) changes.metNote = text(body.metNote, { field: "metNote", max: 280 });
  if (body.caption !== undefined) {
    changes.caption = text(body.caption, { field: "caption", max: 120 }) || "A new memory";
  }
  if (body.destinations !== undefined) {
    changes.destinations = normalizeDestinations(body.destinations, ["home"]);
  }
  if (body.photoDataUrl !== undefined) {
    changes.photoDataUrl = optionalImageDataUrl(body.photoDataUrl);
  }

  const updated = mutate((db) => {
    const index = db.memories.findIndex((m) => m.id === req.params.id);
    if (index === -1) return null;
    const next = { ...db.memories[index], ...changes, id: db.memories[index].id };
    db.memories[index] = next;
    return next;
  });

  if (!updated) throw new HttpError(404, `No saved memory with id "${req.params.id}".`);
  res.json(updated);
});

/** DELETE /api/memories/:id */
router.delete("/:id", (req, res) => {
  const removed = mutate((db) => {
    const before = db.memories.length;
    db.memories = db.memories.filter((m) => m.id !== req.params.id);
    return before !== db.memories.length;
  });

  if (!removed) throw new HttpError(404, `No saved memory with id "${req.params.id}".`);
  res.status(204).end();
});

export default router;
