/**
 * "Who is this?" — the friendly face matcher.
 *
 * Returns the circle's faces as explicit choices for linking a photo.
 * It never guesses an identity from the image itself.
 */
import { Router } from "express";
import { readDb } from "../store.js";
const router = Router();

/**
 * POST /api/faces/candidates
 * Responds with the circle's faces as explicit choices for linking a photo.
 */
router.post("/candidates", (req, res) => {
  const people = readDb().people.map((person) => ({
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    initials: person.initials,
    gradient: person.gradient,
    photoDataUrl: person.photoDataUrl ?? null,
  }));
  res.json({ people });
});

export default router;
