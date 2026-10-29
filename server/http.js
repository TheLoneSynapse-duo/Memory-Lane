/** Shared HTTP helpers for the Memory Lane API. */

/** An error with an HTTP status code, safe to show to the client. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Wraps an async route handler so rejections reach the error middleware. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Coerces a user-supplied string: trims it, clamps it to `max` characters and
 * falls back to `fallback` when it is absent.
 */
export function text(value, { field, max = 280, fallback = "" }) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new HttpError(400, `"${field}" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Coerces an optional image (a captured photo).
 *
 * Accepts a fresh `data:image/...` URL from the camera, and also the
 * `/api/photos/...` (or absolute) URL a photo is stored as once it has been
 * uploaded — screens often echo back what they were given.
 */
export function optionalImageDataUrl(value, { field = "photoDataUrl" } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const isImage =
    typeof value === "string" &&
    (value.startsWith("data:image/") ||
      value.startsWith("/api/photos/") ||
      /^https?:\/\//.test(value));
  if (!isImage) {
    throw new HttpError(400, `"${field}" must be an image.`);
  }
  return value;
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function shortDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fullDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
