/**
 * Photographs in Supabase Storage instead of inside the JSON document.
 *
 * Screens still send photos as `data:image/...` URLs in the JSON body (the
 * camera flow has always worked that way), but when Supabase is configured
 * this middleware swaps every such photo for `/api/photos/...` before the
 * route handlers run — so documents stay small and the 25 MB body limit
 * never turns into unbounded database growth.
 *
 * The bucket stays private: the only way to read a photo is GET
 * /api/photos/<user>/<file>, which checks the session belongs to the person
 * who owns the folder.
 */
import { Router } from "express";
import { HttpError, asyncHandler } from "./http.js";
import { isCloudEnabled, readPhoto, savePhoto } from "./supabase.js";
import { currentUserId } from "./store.js";

/** Keys whose value is a captured photo; `photos` is a list of them. */
const PHOTO_KEYS = new Set(["photoDataUrl", "photo"]);
const PHOTO_LIST_KEYS = new Set(["photos"]);

/** Recursively replaces data-URL photos with stored ones, in place. */
export async function offload(value, userId) {
  if (Array.isArray(value)) {
    for (const item of value) await offload(item, userId);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (PHOTO_KEYS.has(key) && typeof child === "string") {
      if (child.startsWith("data:image/")) value[key] = await savePhoto(userId, child);
    } else if (PHOTO_LIST_KEYS.has(key) && Array.isArray(child)) {
      // A list of photos (a person's pictures): convert each entry itself.
      for (let i = 0; i < child.length; i += 1) {
        const item = child[i];
        if (typeof item === "string" && item.startsWith("data:image/")) {
          child[i] = await savePhoto(userId, item);
        }
      }
      // Objects inside the list may hold photos too.
      for (const item of child) await offload(item, userId);
    } else {
      await offload(child, userId);
    }
  }
}

/**
 * Express middleware: move photos in the request body out to Storage.
 * A no-op without Supabase (photos stay data URLs in db.json, as always).
 */
export function offloadPhotos(req, res, next) {
  if (!isCloudEnabled() || !req.body || typeof req.body !== "object") return next();
  // The face matcher only looks at the photo; storing it would orphan an object.
  if (req.originalUrl.startsWith("/api/faces")) return next();

  const userId = currentUserId();
  if (!userId) return next();

  offload(req.body, userId).then(
    () => next(),
    (error) => next(error)
  );
}

/** GET /api/photos/:folder/:name — one photo, only for the person who owns it. */
export const photosRouter = Router();

photosRouter.get(
  "/:folder/:name",
  asyncHandler(async (req, res) => {
    if (!isCloudEnabled()) throw new HttpError(404, "Photos are stored locally in this mode.");

    const userId = currentUserId();
    // Guard: the auth middleware runs before this, but belt-and-suspenders —
    // a missing userId would pass a null to readPhoto and crash with a 500.
    if (!userId) throw new HttpError(401, "Please sign in to continue.");
    const path = `${req.params.folder}/${req.params.name}`;
    const { buffer, contentType } = await readPhoto(userId, path);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(buffer);
  })
);
