/**
 * The Supabase side of Memory Lane: one JSON document per person, login
 * sessions, and photographs in Storage.
 *
 * Everything here is optional. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * set, each signed-in user reads and writes their own row and their own photos.
 * With neither set the app behaves exactly as it always did — one local
 * db.json file, no login — so a fresh clone still runs with zero setup.
 *
 * The schema lives in server/supabase-schema.sql (run once in the SQL editor);
 * the photos bucket is created automatically on first boot.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SESSION_DAYS = 30;
/** Decoded photo ceiling — the JSON body limit is 25 MB (base64 inflates ~33%). */
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

const PHOTO_BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || "photos";

let client = null;

/**
 * A short server-side cache of session tokens, so a page that fires several
 * requests at once costs one Supabase lookup rather than one per request.
 * Explicitly dropped on logout (revokeSession) —30 seconds is the most a
 * revoked session can outlive its row.
 */
const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map(); // token -> { user, cachedAt }

/** True when the app should store data per user in Supabase instead of db.json. */
export function isCloudEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Where data lives, for the boot log. */
export function cloudStoreLabel() {
  return `supabase (${new URL(process.env.SUPABASE_URL).host})`;
}

/** The single service-role client. Never reaches the browser. */
function supabase() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function fail(where, error) {
  return new Error(`Supabase ${where} failed: ${error.message || error}`);
}

/**
 * POST to GoTrue directly instead of through the shared client.
 *
 * Calling `client.auth.signInWithPassword` would store a session on the
 * client, and supabase-js would then send *the user's* JWT for every later
 * PostgREST call — a role with no rights on these tables, which breaks every
 * save with an RLS error. The data-plane client must stay session-less.
 */
async function gotrue(path, body) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      json.msg || json.message || json.error_description || `GoTrue responded ${response.status}`
    );
    error.status = response.status;
    error.code = String(json.code || json.error_code || "");
    throw error;
  }
  return json;
}

/* ------------------------------------------------------------------ */
/* Documents — one JSON row per person                                 */
/* ------------------------------------------------------------------ */

/** The whole store for one user, or null the first time they visit. */
export async function loadUserDocument(userId) {
  const { data, error } = await supabase()
    .from("documents")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fail("document read", error);
  return data?.data ?? null;
}

/** Writes the whole store for one user (first save inserts the row). */
export async function saveUserDocument(userId, doc) {
  const { error } = await supabase()
    .from("documents")
    .upsert({ user_id: userId, data: doc, updated_at: new Date().toISOString() });
  if (error) throw fail("document write", error);
}

/* ------------------------------------------------------------------ */
/* Accounts and sessions                                               */
/* ------------------------------------------------------------------ */

/** Creates an account without needing a confirmation email. */
export async function registerAccount(email, password) {
  let data;
  try {
    data = await gotrue("admin/users", { email, password, email_confirm: true });
  } catch (error) {
    if (
      error.code === "email_exists" ||
      /already (been )?registered|duplicate key|unique constraint/i.test(error.message || "")
    ) {
      const err = new Error("That email already has an account — sign in instead.");
      err.status = 409;
      throw err;
    }
    throw fail("sign-up", error);
  }
  return { id: data.id, email: data.email };
}

/** Checks email + password against Supabase Auth. */
export async function signIn(email, password) {
  let data;
  try {
    data = await gotrue("token?grant_type=password", { email, password });
  } catch (error) {
    if (error.status === 400 || /invalid login credentials/i.test(error.message || "")) {
      const err = new Error("That email and password don't match an account yet.");
      err.status = 401;
      throw err;
    }
    throw fail("sign-in", error);
  }
  return { id: data.user?.id, email: data.user?.email };
}

/**
 * The app's own session: a random token in a table, not a Supabase JWT, so it
 * lasts for weeks without any refresh dance.
 */
export async function createSession(user) {
  const token = randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  const { error } = await supabase()
    .from("sessions")
    .insert({ token, user_id: user.id, email: user.email ?? "", expires_at });
  if (error) throw fail("session create", error);
  return { token, expiresAt: expires_at };
}

/** The user behind a session token, or null when it is unknown or expired. */
export async function sessionUser(token) {
  if (!token) return null;

  const hit = sessionCache.get(token);
  if (hit && Date.now() - hit.cachedAt < SESSION_CACHE_MS) return hit.user;

  const { data, error } = await supabase()
    .from("sessions")
    .select("user_id, email, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw fail("session read", error);
  if (!data) {
    sessionCache.delete(token);
    return null;
  }
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await revokeSession(token);
    return null;
  }
  const user = { id: data.user_id, email: data.email };
  sessionCache.set(token, { user, cachedAt: Date.now() });
  return user;
}

export async function revokeSession(token) {
  if (!token) return;
  sessionCache.delete(token);
  const { error } = await supabase().from("sessions").delete().eq("token", token);
  if (error) throw fail("session revoke", error);
}

/* ------------------------------------------------------------------ */
/* Photographs                                                         */
/* ------------------------------------------------------------------ */

const EXT_BY_MIME = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", gif: "gif", avif: "avif" };

/**
 * Puts a captured photo into Storage under the user's own folder and returns
 * the path that will be stored in their document (served back through
 * /api/photos, so the bucket itself stays private).
 */
export async function savePhoto(userId, dataUrl) {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) {
    const err = new Error("That doesn't look like an image.");
    err.status = 400;
    throw err;
  }
  const subtype = match[1].toLowerCase();
  const ext = EXT_BY_MIME[subtype];
  if (!ext) {
    const err = new Error("Photos must be JPEG, PNG, WebP, GIF or AVIF images.");
    err.status = 400;
    throw err;
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length > MAX_PHOTO_BYTES) {
    const err = new Error("That photo is too large to save — try a smaller one.");
    err.status = 413;
    throw err;
  }

  const folder = userId.replace(/[^a-zA-Z0-9-]/g, "");
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const path = `${folder}/${name}`;

  const { error } = await supabase().storage.from(PHOTO_BUCKET).upload(path, buffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: false,
  });
  if (error) throw fail("photo upload", error);

  return `/api/photos/${path}`;
}

/** Downloads one photo, refusing anything outside the user's own folder. */
export async function readPhoto(userId, path) {
  const folder = userId.replace(/[^a-zA-Z0-9-]/g, "");
  if (!path.startsWith(`${folder}/`)) {
    const err = new Error("That photo belongs to someone else.");
    err.status = 403;
    throw err;
  }
  const { data, error } = await supabase().storage.from(PHOTO_BUCKET).download(path);
  if (error) throw fail("photo read", error);
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || "image/jpeg",
  };
}

/* ------------------------------------------------------------------ */
/* Boot checks                                                         */
/* ------------------------------------------------------------------ */

/**
 * Confirms the schema is in place and the photo bucket exists (creating the
 * bucket if it is missing). Throws a message that says exactly what to run.
 */
export async function verifyCloudSetup() {
  const { error: tables } = await supabase().from("documents").select("user_id").limit(1);
  if (tables) {
    throw new Error(
      `Supabase is unreachable, or its schema is missing (${tables.message}).\n` +
        `  Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, run the contents of ` +
        `server/supabase-schema.sql in your project's SQL editor, then start again.`
    );
  }

  const { data: buckets, error: bucketError } = await supabase().storage.listBuckets();
  if (bucketError) throw new Error(`Could not list storage buckets: ${bucketError.message}`);
  if (!buckets?.some((bucket) => bucket.name === PHOTO_BUCKET)) {
    const { error: createError } = await supabase().storage.createBucket(PHOTO_BUCKET, {
      public: false,
    });
    if (createError) {
      throw new Error(
        `Could not create the "${PHOTO_BUCKET}" storage bucket (${createError.message}).\n` +
          `  Create it by hand in Storage → New bucket (private), then start again.`
      );
    }
  }

  // Best-effort hygiene: sessions that ran out while nobody was using them.
  await supabase().from("sessions").delete().lt("expires_at", new Date().toISOString());
}
