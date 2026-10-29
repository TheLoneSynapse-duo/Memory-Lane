import { apiDelete, apiGet, apiPatch } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";

export interface TodayEvent {
  id: string;
  /** Time of the event, e.g. "12:30". */
  time: string;
  headline: string;
  description: string;
  /**
   * The day this belongs to ("YYYY-MM-DD"). Empty means today — which is how
   * every event saved before the date field existed reads.
   */
  date?: string;
  /** Matches a Person id in people.ts. */
  personId: string;
}

export interface UpcomingEvent {
  id: string;
  /** e.g. "Tomorrow", "Wednesday". */
  day: string;
  title: string;
  personId: string;
}

/** What is already waiting around the corner. */
const upcoming = createResource<UpcomingEvent[]>(
  () => apiGet<UpcomingEvent[]>("/events/upcoming"),
  []
);

export function useUpcomingEventsState(): ResourceState<UpcomingEvent[]> {
  return useResource(upcoming);
}

export function reloadUpcomingEvents(): Promise<void> {
  return upcoming.reload();
}

/** The editable fields of one "Coming up" entry. */
export interface UpcomingEventInput {
  day: string;
  title: string;
}

function replaceUpcoming(id: string, next: UpcomingEvent) {
  upcoming.setData(
    upcoming.getState().data.map((event) => (event.id === id ? next : event))
  );
}

/** Rewrites one entry of "Coming up", straight away and rolled back if refused. */
export async function updateUpcomingEvent(
  id: string,
  input: UpcomingEventInput
): Promise<UpcomingEvent> {
  const previous = upcoming.getState().data;
  upcoming.setData(
    previous.map((event) =>
      event.id === id
        ? { ...event, day: input.day.trim() || "Soon", title: input.title.trim() }
        : event
    )
  );

  try {
    const saved = await apiPatch<UpcomingEvent>(`/events/upcoming/${id}`, input);
    replaceUpcoming(id, saved);
    return saved;
  } catch (error) {
    upcoming.setData(previous);
    throw error;
  }
}

/** Takes an entry out of "Coming up". */
export async function removeUpcomingEvent(id: string): Promise<void> {
  const previous = upcoming.getState().data;
  upcoming.setData(previous.filter((event) => event.id !== id));

  try {
    await apiDelete(`/events/upcoming/${id}`);
  } catch (error) {
    upcoming.setData(previous);
    throw error;
  }
}
