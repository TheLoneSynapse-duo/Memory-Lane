/** Photo stories — the familiar days the user can hear told again. */
import { Router } from "express";
import { HttpError, optionalImageDataUrl, text } from "../http.js";
import { mutate, readDb } from "../store.js";

const router = Router();

/** The illustration a story is drawn with. */
const SCENES = ["cake", "garden", "tea", "wedding", "robin", "sunday"];

/**
 * The colour behind each illustration. The app paints `wash` as an inline
 * style, so only these known gradients are ever accepted back from a client —
 * anything else could smuggle extra CSS declarations into the page.
 */
const SCENE_WASHES = {
  cake: "linear-gradient(to bottom right, #fbe3b8, #f6d3ae, #eebf9d)",
  garden: "linear-gradient(to bottom right, #e9edd6, #dde6c1, #c9d9a0)",
  tea: "linear-gradient(to bottom right, #f4e7cd, #ecd8b6, #e1c69d)",
  wedding: "linear-gradient(to bottom right, #f6d9d2, #efc5bb, #e3ac9d)",
  robin: "linear-gradient(to bottom right, #e7dfd1, #dbd0bb, #c9ba9c)",
  sunday: "linear-gradient(to bottom right, #f2e0c6, #e8d0ae, #dabb8d)",
};
const WASHES = new Set(Object.values(SCENE_WASHES));

function cleanScene(value, fallback = "cake") {
  const scene = typeof value === "string" ? value.trim() : fallback;
  if (!SCENES.includes(scene)) {
    throw new HttpError(400, `"scene" must be one of ${SCENES.join(", ")}.`);
  }
  return scene;
}

function cleanWash(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const wash = typeof value === "string" ? value.trim() : "";
  if (!WASHES.has(wash)) {
    throw new HttpError(400, '"wash" must be one of the story colours.');
  }
  return wash;
}

/** A readable, url-friendly id that is unique within the store. */
function uniqueId(db, title) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    || "story";
  let id = base;
  let n = 2;
  while (db.stories.some((story) => story.id === id)) id = `${base}-${n++}`;
  return id;
}

/** GET /api/stories */
router.get("/", (req, res) => {
  res.json(readDb().stories);
});

/** GET /api/stories/:id */
router.get("/:id", (req, res) => {
  const story = readDb().stories.find((s) => s.id === req.params.id);
  if (!story) throw new HttpError(404, `No story with id "${req.params.id}".`);
  res.json(story);
});

/** POST /api/stories — add a story to the shelf. */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const title = text(body.title, { field: "title", max: 80 });
  if (!title) throw new HttpError(400, '"title" is required — what is this story called?');

  const context = text(body.context, { field: "context", max: 120 });
  const storyText = text(body.story, { field: "story", max: 2000 });
  if (!storyText) throw new HttpError(400, '"story" is required — a few lines about the day.');

  const scene = cleanScene(body.scene);
  const wash = cleanWash(body.wash, SCENE_WASHES[scene]);
  const photoDataUrl = optionalImageDataUrl(body.photoDataUrl);

  const created = mutate((db) => {
    const story = {
      id: uniqueId(db, title),
      title,
      context,
      scene,
      wash,
      story: storyText,
      photoDataUrl,
    };
    db.stories.push(story);
    return story;
  });

  res.status(201).json(created);
});

/** PATCH /api/stories/:id — rewrite a story that is already on the shelf. */
router.patch("/:id", (req, res) => {
  const body = req.body ?? {};

  const updated = mutate((db) => {
    const index = db.stories.findIndex((story) => story.id === req.params.id);
    if (index === -1) throw new HttpError(404, `No story with id "${req.params.id}".`);
    const current = db.stories[index];

    const title = body.title === undefined ? current.title : text(body.title, { field: "title", max: 80 });
    if (!title) throw new HttpError(400, '"title" cannot be empty.');

    const context =
      body.context === undefined ? current.context : text(body.context, { field: "context", max: 120 });

    const storyText =
      body.story === undefined ? current.story : text(body.story, { field: "story", max: 2000 });
    if (!storyText) throw new HttpError(400, '"story" cannot be empty.');

    const scene = body.scene === undefined ? current.scene : cleanScene(body.scene, current.scene);

    // Changing the illustration also changes its colour — unless a colour was
    // chosen deliberately, which always wins.
    // A photo replaces the illustration when there is one; sending null clears
    // it and the drawn picture comes back. An absent field changes nothing.
    const photoDataUrl =
      body.photoDataUrl === undefined
        ? (current.photoDataUrl ?? null)
        : optionalImageDataUrl(body.photoDataUrl, { field: "photoDataUrl" });

    const sceneChanged = body.scene !== undefined && body.scene !== current.scene;
    const wash =
      body.wash !== undefined
        ? cleanWash(body.wash, current.wash)
        : sceneChanged
          ? SCENE_WASHES[scene]
          : current.wash;

    const next = { ...current, title, context, scene, wash, story: storyText, photoDataUrl };
    db.stories[index] = next;
    return next;
  });

  res.json(updated);
});

/** DELETE /api/stories/:id — take a story off the shelf. */
router.delete("/:id", (req, res) => {
  mutate((db) => {
    const index = db.stories.findIndex((story) => story.id === req.params.id);
    if (index === -1) throw new HttpError(404, `No story with id "${req.params.id}".`);
    db.stories.splice(index, 1);
  });
  res.json({ ok: true });
});

export default router;
