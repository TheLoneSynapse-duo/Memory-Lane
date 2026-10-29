/**
 * The person using the app.
 *
 * The device keeps its own copy so "Hello, {name}" appears before anything has
 * loaded; this is the same copy in the store, which is what lets the companion
 * know who it is talking to. Without it the voice agent has no answer at all
 * when someone asks their own name.
 */
import { Router } from "express";
import { text } from "../http.js";
import { mutate, readDb } from "../store.js";

const router = Router();

/** GET /api/profile — the personal details as they stand. */
router.get("/", (req, res) => {
  res.json(readDb().profile);
});

/**
 * POST /api/profile — the welcome step and the personal-details dialog.
 *
 * A missing field clears it rather than keeping the old value: the form sends
 * the whole profile, and "skip for now" is an answer too.
 */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const profile = {
    name: text(body.name, { field: "name", max: 60 }),
    preferredName: text(body.preferredName, { field: "preferredName", max: 40 }),
    about: text(body.about, { field: "about", max: 240 }),
  };

  mutate((db) => {
    db.profile = profile;
  });

  res.json(profile);
});

export default router;
