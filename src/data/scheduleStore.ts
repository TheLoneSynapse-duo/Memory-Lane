import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";
import type { TodayEvent } from "./events";

/** The editable fields of a schedule event. */
export interface ScheduleEventInput {
  time: string;
  headline: string;
  description: string;
  /** The day it belongs to ("YYYY-MM-DD"); empty means today. */
  date: string;
  /**
   * Who the card's contact chip shows: a Person id, or "" for an event that
   * is nobody's but the user's own. Omitting it lets the server work out who
   * the wording names.
   */
  personId?: string;
}

/**
 * Today's schedule as the API merges it: the default events (minus the ones the
 * user removed) with their rewrites applied, followed by brand-new events.
 */
const schedule = createResource<TodayEvent[]>(() => apiGet<TodayEvent[]>("/schedule"), []);

export function useScheduleState(): ResourceState<TodayEvent[]> {
  return useResource(schedule);
}

export function reloadSchedule(): Promise<void> {
  return schedule.reload();
}

/** The same normalisation the API applies, so optimistic updates match. */
function optimisticEvent(id: string, input: ScheduleEventInput, previous?: TodayEvent): TodayEvent {
  return {
    id,
    time: input.time.trim() || "Anytime",
    headline: input.headline.trim(),
    description: input.description.trim(),
    date: input.date,
    personId: input.personId ?? previous?.personId ?? "",
  };
}

/** Adds a brand-new event to today's schedule. */
export async function addScheduleEvent(input: ScheduleEventInput): Promise<TodayEvent> {
  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previous = schedule.getState().data;
  schedule.setData([...previous, optimisticEvent(optimisticId, input)]);

  try {
    const saved = await apiPost<TodayEvent>("/schedule/events", input);
    schedule.setData(
      schedule.getState().data.map((event) => (event.id === optimisticId ? saved : event))
    );
    return saved;
  } catch (error) {
    schedule.setData(previous);
    throw error;
  }
}

/** Rewrites an existing event (default or added) with new details. */
export async function updateScheduleEvent(id: string, input: ScheduleEventInput): Promise<TodayEvent> {
  const previous = schedule.getState().data;
  schedule.setData(
    previous.map((event) =>
      event.id === id ? optimisticEvent(id, input, event) : event
    )
  );

  try {
    const saved = await apiPatch<TodayEvent>(`/schedule/events/${id}`, input);
    schedule.setData(schedule.getState().data.map((event) => (event.id === id ? saved : event)));
    return saved;
  } catch (error) {
    schedule.setData(previous);
    throw error;
  }
}

/** Removes an event; default events stay removed on the server. */
export async function removeScheduleEvent(id: string): Promise<void> {
  const previous = schedule.getState().data;
  schedule.setData(previous.filter((event) => event.id !== id));

  try {
    await apiDelete(`/schedule/events/${id}`);
  } catch (error) {
    schedule.setData(previous);
    throw error;
  }
}
