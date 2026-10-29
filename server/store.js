/**
 * The Memory Lane data store.
 *
 * Two ways to keep everything the app knows, chosen by environment:
 *
 * - Local (no Supabase configured): one JSON document on disk
 *   (server/data/db.json by default) — small, human-readable, easy to reset.
 * - Cloud (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set): each signed-in user
 *   owns one JSON document row of their own. auth.js loads it into memory
 *   before the request handlers run; changes are written back on a per-user
 *   queue, so every route in routes/ works unchanged in both modes.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http.js";
import { DESTINATIONS, createSeed } from "./seed.js";
import {
  cloudStoreLabel,
  isCloudEnabled,
  loadUserDocument,
  saveUserDocument,
} from "./supabase.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.MEMORY_LANE_DATA_DIR
  ? path.resolve(process.env.MEMORY_LANE_DATA_DIR)
  : path.join(here, "data");

export const DB_FILE = path.join(DATA_DIR, "db.json");

/** @type {ReturnType<typeof createSeed> | null} */
let db = null;

/**
 * Fills missing fields in older or partial documents. Explicit empty arrays
 * remain empty, and existing user content is left untouched.
 */
function normalizeDb(raw) {
  const seed = createSeed();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    schemaVersion: seed.schemaVersion,
    // The person themselves: name, what they like to be called, a line about
    // them. Empty until the welcome step answers — an empty profile is a real
    // answer (they chose "skip"), so a missing field falls back only.
    profile: {
      name: typeof source.profile?.name === "string" ? source.profile.name : "",
      preferredName:
        typeof source.profile?.preferredName === "string"
          ? source.profile.preferredName
          : "",
      about: typeof source.profile?.about === "string" ? source.profile.about : "",
    },
    people: Array.isArray(source.people) ? source.people : seed.people,
    // Empty arrays are real answers; only a missing or broken field falls back
    // to the empty initial value.
    stories: Array.isArray(source.stories) ? source.stories : seed.stories,
    home: {
      // An empty array is a real answer. Moments written before ids existed
      // get a stable one from their place.
      moments: Array.isArray(source.home?.moments)
        ? source.home.moments
            .filter((moment) => moment && typeof moment === "object")
            .map((moment, index) => ({ ...moment, id: moment.id || `moment-${index}` }))
        : seed.home.moments,
    },
    defaultTodayEvents: Array.isArray(source.defaultTodayEvents)
      ? source.defaultTodayEvents
      : seed.defaultTodayEvents,
    upcomingEvents: Array.isArray(source.upcomingEvents) ? source.upcomingEvents : seed.upcomingEvents,
    memories: Array.isArray(source.memories)
      ? source.memories.map((memory) => normalizeMemory(memory)).filter(Boolean)
      : [],
    schedule: {
      events:
        source.schedule && typeof source.schedule.events === "object" && source.schedule.events
          ? source.schedule.events
          : {},
      removedIds: Array.isArray(source.schedule?.removedIds) ? source.schedule.removedIds : [],
      changes: Array.isArray(source.schedule?.changes) ? source.schedule.changes : [],
    },
  };
}

/** Repairs a stored memory card (destinations are the only field that changed shape). */
function normalizeMemory(card) {
  if (!card || typeof card !== "object" || typeof card.id !== "string") return null;
  return {
    id: card.id,
    name: typeof card.name === "string" ? card.name : "",
    metNote: typeof card.metNote === "string" ? card.metNote : "",
    caption: typeof card.caption === "string" && card.caption ? card.caption : "A new memory",
    createdAt:
      typeof card.createdAt === "string" && card.createdAt
        ? card.createdAt
        : new Date().toISOString(),
    photoDataUrl: typeof card.photoDataUrl === "string" ? card.photoDataUrl : null,
    destinations:
      Array.isArray(card.destinations) && card.destinations.length
        ? card.destinations.filter((id) => DESTINATIONS.includes(id))
        : ["home"],
  };
}

function persist() {
  mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  renameSync(temp, DB_FILE);
}

/* ------------------------------------------------------------------ */
/* Per-user context (cloud mode)                                       */
/* ------------------------------------------------------------------ */

/**
 * Which user this request is serving. auth.js's guard sets it for every
 * request when Supabase is configured; it is absent in local file mode and
 * in standalone scripts (agent:publish), which only ever read.
 */
const context = new AsyncLocalStorage();

/** Runs `fn` as `userId` — every store call inside it inherits the user. */
export function runAsUser(userId, fn) {
  return context.run({ userId }, fn);
}

/** The signed-in user for the current request, or null outside a request. */
export function currentUserId() {
  return context.getStore()?.userId ?? null;
}

/**
 * One cached document per user. Handlers read it synchronously; every change
 * is written back on that user's queue, so saves land in order and no route
 * ever has to await a network round-trip.
 */
const userDocs = new Map();

/** In-flight first loads, so two simultaneous first requests share one fetch. */
const preloading = new Map();

/** Loads a user's document (seeding a fresh one) before any handler reads it. */
export async function preloadDocument(userId) {
  if (userDocs.has(userId)) return;
  let loading = preloading.get(userId);
  if (!loading) {
    loading = (async () => {
      const stored = await loadUserDocument(userId);
      const entry = { db: stored ? normalizeDb(stored) : createSeed(), chain: Promise.resolve() };
      userDocs.set(userId, entry);
      if (!stored) queueSave(userId, entry); // first visit — persist the empty account
    })().finally(() => preloading.delete(userId));
    preloading.set(userId, loading);
  }
  await loading;
}

/**
 * Serialises writes for one user. A failed save is logged and retried once
 * after a pause; if that also fails, the next change saves the latest state.
 */
function queueSave(userId, entry, attempt = 0) {
  entry.chain = entry.chain
    .then(() => saveUserDocument(userId, entry.db))
    .catch((error) => {
      console.error(
        `[memory-lane] could not save the document for ${userId} ` +
          `(attempt ${attempt + 1}):`,
        error.message || error
      );
      if (attempt < 1) {
        setTimeout(() => queueSave(userId, entry, attempt + 1), 2_000);
      }
    });
}

/** The current user's cached document — cloud mode only, always behind the guard. */
function cloudEntry() {
  const userId = currentUserId();
  const entry = userId ? userDocs.get(userId) : null;
  if (!entry) throw new HttpError(401, "Please sign in to continue.");
  return { userId, entry };
}

/* ------------------------------------------------------------------ */
/* Reading and writing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Reads the store. In cloud mode this is the signed-in user's own document;
 * a standalone script outside any request gets a pristine empty copy to read
 * (that is all agent:publish needs — the persona greeting).
 */
export function readDb() {
  if (isCloudEnabled()) {
    const userId = currentUserId();
    if (!userId) return normalizeDb(createSeed());
    const entry = userDocs.get(userId);
    if (!entry) throw new HttpError(401, "Your session could not be loaded — sign in again.");
    return entry.db;
  }
  if (db) return db;
  if (existsSync(DB_FILE)) {
    try {
      db = normalizeDb(JSON.parse(readFileSync(DB_FILE, "utf8")));
      return db;
    } catch (error) {
      console.error(`[memory-lane] could not read ${DB_FILE}, starting from the seed:`, error.message);
    }
  }
  db = createSeed();
  persist();
  return db;
}

/** Where the store lives, for the boot log. */
export function ensureDataFile() {
  if (isCloudEnabled()) return cloudStoreLabel();
  readDb();
  return DB_FILE;
}

/**
 * Applies a change to the store and saves it (the file synchronously, the
 * cloud document on the user's queue). The mutator may return a value, which
 * is passed through to the caller.
 */
export function mutate(mutator) {
  if (isCloudEnabled()) {
    const { userId, entry } = cloudEntry();
    const result = mutator(entry.db);
    queueSave(userId, entry);
    return result;
  }
  const current = readDb();
  const result = mutator(current);
  persist();
  return result;
}

/** Clears the current account's content back to its initial empty state. */
export function resetDb() {
  if (isCloudEnabled()) {
    const { userId, entry } = cloudEntry();
    entry.db = createSeed();
    queueSave(userId, entry);
    return entry.db;
  }
  db = createSeed();
  persist();
  return db;
}

/* ------------------------------------------------------------------ */
/* Domain helpers                                                      */
/* ------------------------------------------------------------------ */

/** The local calendar day as "YYYY-MM-DD". */
export function isoDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * An event belongs to today when it carries no date (everything written before
 * dates existed reads this way) or today's date. Anything else belongs to
 * another day and must not show up under "Today".
 */
export function isTodayEvent(event, now = new Date()) {
  if (!event || !event.date) return true;
  return event.date === isoDay(now);
}

/**
 * Today's schedule: the default events (minus any the user removed) with their
 * rewrites applied, followed by brand-new events in the order they were added.
 * Mirrors the merge the frontend used to do in localStorage.
 */
export function mergeTodayEvents(database = readDb()) {
  const { events, removedIds } = database.schedule;
  const defaultIds = new Set(database.defaultTodayEvents.map((event) => event.id));
  // A removed id hides the event without destroying it: a default one still
  // lives in defaultTodayEvents, an added one still lives in events. That is
  // what lets a family member see what was taken off the day.
  const removed = new Set(removedIds);

  const defaults = database.defaultTodayEvents
    .filter((event) => !removed.has(event.id))
    .map((event) => events[event.id] ?? event);

  const custom = Object.entries(events)
    .filter(([id]) => !defaultIds.has(id) && !removed.has(id))
    .map(([, event]) => event);

  return [...defaults, ...custom];
}

/** Escapes a phrase so it can be looked for literally inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `haystack` mentions `phrase` as a whole word (or two), not a fragment. */
function mentions(haystack, phrase) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`);
  return pattern.test(haystack);
}

/**
 * Which face in the circle a piece of writing is about: "meeting with Frank",
 * "Call Rithu", "Lunch with Ruby Marsh".
 *
 * An event only earns the contact chip on its card when it is linked to a
 * person, and most events are written — by the editor or said out loud to the
 * companion — without anyone ever picking one. So whoever is named in the
 * wording is who the event belongs to. The longest mention wins, so a full
 * name beats a first name that is also in the circle; nobody named gives "".
 */
export function matchPersonId(database, ...texts) {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase().trim();
  if (!haystack) return "";

  let bestId = "";
  let bestLength = 0;

  for (const person of database.people ?? []) {
    const name = (person.name ?? "").trim().toLowerCase();
    if (name.length < 2) continue;

    // The full name first, then the first name on its own — "Ruby" finds
    // "Ruby is coming for lunch" without needing the surname written down.
    const variants = [name, ...name.split(/\s+/)].filter((word) => word.length >= 2);
    for (const variant of variants) {
      if (variant.length > bestLength && mentions(haystack, variant)) {
        bestLength = variant.length;
        bestId = person.id;
      }
    }
  }

  return bestId;
}

/**
 * Appends one entry to the schedule's change log.
 *
 * Nothing prunes this list: it is the record of what the day used to say, and
 * it is what a family member reads to see what was moved or taken off.
 */
export function recordScheduleChange(database, change) {
  const entry = {
    id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...change,
  };
  database.schedule.changes = [entry, ...(database.schedule.changes ?? [])];
  return entry;
}

/** A stable "memory of the day" — the same one for the whole calendar day. */
export function memoryOfTheDay(moments, now = new Date()) {
  if (!moments.length) return null;
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  return moments[dayIndex % moments.length];
}
