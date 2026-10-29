/** The family and friends the app can recognise. */
import { Router } from "express";
import { HttpError, optionalImageDataUrl, pickRandom, text } from "../http.js";
import { mutate, readDb } from "../store.js";

const router = Router();

/** The gradients a new face starts with — the same family the seed uses. */
const GRADIENTS = [
  "linear-gradient(135deg, #C97B3A 0%, #A3542E 100%)",
  "linear-gradient(135deg, #7C8C5E 0%, #4E5A3C 100%)",
  "linear-gradient(135deg, #D9A441 0%, #A3661D 100%)",
  "linear-gradient(135deg, #9C5B6B 0%, #6E3B49 100%)",
  "linear-gradient(135deg, #4E7A8C 0%, #2F5462 100%)",
  "linear-gradient(135deg, #8C8477 0%, #5E574C 100%)",
];

/** "Tom" → "TM", "Ellen Marsh" → "EM" — the initials the seed uses. */
function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  const word = parts[0];
  return (word.length > 1 ? `${word[0]}${word[word.length - 1]}` : word).toUpperCase();
}

/** GET /api/people — everyone in the user's circle. */
router.get("/", (req, res) => {
  res.json(readDb().people);
});

/**
 * POST /api/people — add a familiar face to the circle.
 *
 * The server fills in everything the card reads (initials, a gradient, the
 * gentle defaults for a person nobody has written about yet), so a person
 * added from any screen is complete the moment it lands.
 */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, { field: "name", max: 40 });
  if (!name) {
    throw new HttpError(400, 'A face needs a name — what should the app call them?');
  }

  const relationship =
    text(body.relationship, { field: "relationship", max: 60 }) || "A familiar face";
  const bio =
    text(body.bio, { field: "bio", max: 400 }) ||
    `You haven't written down how you know ${name} yet.`;
  const photoDataUrl = optionalImageDataUrl(body.photoDataUrl);

  // The rest of the card is optional: a name and how you know them is enough,
  // and anything left blank gets the gentle default the card reads out.
  const lastMet =
    text(body.lastMet, { field: "lastMet", max: 240 }) || "Not written down yet.";
  const conversationStarter =
    text(body.conversationStarter, { field: "conversationStarter", max: 300 }) ||
    `${name} has just joined your circle — ask them what they have been up to lately.`;
  const loves = Array.isArray(body.loves)
    ? body.loves
        .map((love) => text(love, { field: "loves", max: 60 }))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const person = {
    id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    relationship,
    initials: initialsFor(name),
    gradient: GRADIENTS[readDb().people.length % GRADIENTS.length],
    bio,
    lastMet,
    loves,
    conversationStarter,
    photos: [],
    photoDataUrl,
  };

  mutate((db) => {
    db.people = [...db.people, person];
  });

  res.status(201).json(person);
});

/** GET /api/people/random — a surprise familiar face. */
router.get("/random", (req, res) => {
  const { people } = readDb();
  if (!people.length) throw new HttpError(404, "No familiar faces have been added yet.");
  res.json(pickRandom(people));
});

/** GET /api/people/by-name/:name — case-insensitive exact match, used to link saved photos. */
router.get("/by-name/:name", (req, res) => {
  const wanted = req.params.name.trim().toLowerCase();
  const person = readDb().people.find((p) => p.name.trim().toLowerCase() === wanted);
  if (!person) throw new HttpError(404, `Nobody in the circle is called "${req.params.name}".`);
  res.json(person);
});

/** GET /api/people/:id — one person's full card. */
router.get("/:id", (req, res) => {
  const person = readDb().people.find((p) => p.id === req.params.id);
  if (!person) throw new HttpError(404, `No person with id "${req.params.id}".`);
  res.json(person);
});

/**
 * PATCH /api/people/:id — the edit option on a person's card.
 *
 * Today it carries the photograph chosen from the device, which replaces the
 * drawn stand-in wherever that person appears. Sending null puts the
 * gradient back.
 */
router.patch("/:id", (req, res) => {
  const body = req.body ?? {};
  const changes = {};

  if (body.photoDataUrl !== undefined) {
    changes.photoDataUrl = optionalImageDataUrl(body.photoDataUrl);
  }

  const updated = mutate((db) => {
    const index = db.people.findIndex((p) => p.id === req.params.id);
    if (index === -1) return null;
    const next = { ...db.people[index], ...changes, id: db.people[index].id };
    db.people[index] = next;
    return next;
  });

  if (!updated) throw new HttpError(404, `No person with id "${req.params.id}".`);
  res.json(updated);
});

/**
 * DELETE /api/people/:id — take someone out of the circle.
 *
 * Their saved photographs stay in the library; only the card goes, so a photo
 * can be linked to a new face afterwards.
 */
router.delete("/:id", (req, res) => {
  const removed = mutate((db) => {
    const index = db.people.findIndex((p) => p.id === req.params.id);
    if (index === -1) return null;
    const [person] = db.people.splice(index, 1);
    return person;
  });

  if (!removed) throw new HttpError(404, `No person with id "${req.params.id}".`);
  res.json({ removed: removed.id, name: removed.name });
});

export default router;
