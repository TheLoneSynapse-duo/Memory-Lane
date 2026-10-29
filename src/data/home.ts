import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";

/** A short reflection shown on the home screen. */
export interface Moment {
  id: string;
  title: string;
  text: string;
  /** A photograph chosen from the device, shown with the moment. */
  photoDataUrl?: string | null;
}

/** What it takes to write a moment down. */
export interface MomentInput {
  title: string;
  text: string;
  photoDataUrl?: string | null;
}

/** Everything the home screen opens with. */
export interface HomeContent {
  /** Null once every moment has been taken off the list. */
  memoryOfTheDay: Moment | null;
  moments: Moment[];
}

/**
 * Gives every moment a stable id before it reaches a screen.
 *
 * An older server can hand back moments without ids; without this, editing
 * one of them would look like editing all of them at once.
 */
function normalizeHome(raw: HomeContent): HomeContent {
  const moments = (raw.moments ?? []).map((moment, index) => ({
    ...moment,
    id: moment.id || `moment-${index}`,
  }));
  return { memoryOfTheDay: pickMemoryOfTheDay(moments), moments };
}

const home = createResource<HomeContent | null>(
  () => apiGet<HomeContent>("/home").then(normalizeHome),
  null
);

export function useHomeState(): ResourceState<HomeContent | null> {
  return useResource(home);
}

export function reloadHome(): Promise<void> {
  return home.reload();
}

/** What the server will pick for the memory of the day (see store.js). */
function pickMemoryOfTheDay(moments: Moment[]): Moment | null {
  if (!moments.length) return null;
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return moments[dayIndex % moments.length];
}

/** Applies a change to the moment list, keeping the memory of the day in step. */
function setMoments(next: Moment[]): void {
  const state = home.getState();
  if (!state.data) return;
  home.setData({
    memoryOfTheDay: pickMemoryOfTheDay(next),
    moments: next,
  });
}

/** Adds a moment worth keeping. */
export async function addMoment(input: MomentInput): Promise<Moment> {
  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previous = home.getState().data;
  const optimistic: Moment = {
    id: optimisticId,
    title: input.title,
    text: input.text,
    photoDataUrl: input.photoDataUrl ?? null,
  };
  if (previous) setMoments([...previous.moments, optimistic]);

  try {
    const saved = await apiPost<Moment>("/home/moments", input);
    setMoments(
      (home.getState().data?.moments ?? []).map((m) => (m.id === optimisticId ? saved : m))
    );
    return saved;
  } catch (error) {
    if (previous) setMoments(previous.moments);
    throw error;
  }
}

/** Rewrites a moment. */
export async function updateMoment(id: string, input: MomentInput): Promise<Moment> {
  const previous = home.getState().data;
  const optimistic: Moment = {
    id,
    title: input.title,
    text: input.text,
    photoDataUrl: input.photoDataUrl ?? null,
  };
  if (previous) {
    setMoments(previous.moments.map((m) => (m.id === id ? optimistic : m)));
  }

  try {
    const saved = await apiPatch<Moment>(`/home/moments/${id}`, input);
    setMoments(
      (home.getState().data?.moments ?? []).map((m) => (m.id === id ? saved : m))
    );
    return saved;
  } catch (error) {
    if (previous) setMoments(previous.moments);
    throw error;
  }
}

/** Takes a moment off the list. */
export async function removeMoment(id: string): Promise<void> {
  const previous = home.getState().data;
  if (previous) setMoments(previous.moments.filter((m) => m.id !== id));

  try {
    await apiDelete(`/home/moments/${id}`);
  } catch (error) {
    if (previous) setMoments(previous.moments);
    throw error;
  }
}
