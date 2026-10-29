/**
 * Creates the initial Memory Lane document for a new account or local store.
 * Personal content starts empty; all screens and creation flows remain available.
 */

/** Where a captured photo can be kept. Matches MemoryDestination in the app. */
export const DESTINATIONS = ["home", "faces", "stories"];

/**
 * Start state for a fresh account or local store.
 * All real content comes from the person using the app; nothing here is a sample.
 */
export function createSeed() {
  return {
    schemaVersion: 1,
    profile: { name: "", preferredName: "", about: "" },
    people: [],
    stories: [],
    home: { moments: [] },
    defaultTodayEvents: [],
    upcomingEvents: [],
    memories: [],
    schedule: { events: {}, removedIds: [], changes: [] },
  };
}
