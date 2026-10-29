import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";

/** Where a captured photo can be kept. */
export type MemoryDestination = "home" | "faces" | "stories";

export interface SavedMemoryCard {
  id: string;
  /** Who is in the photo, as the user typed it (may be empty). */
  name: string;
  /** Optional "how you met" note from the user. */
  metNote: string;
  /** Short auto-generated caption. */
  caption: string;
  /** ISO date the memory was saved. */
  createdAt: string;
  /** JPEG data URL from the camera (or chosen image). */
  photoDataUrl: string | null;
  /** Places this photo was saved to. */
  destinations: MemoryDestination[];
}

/** The fields the camera flow sends when a photo is kept. */
export interface SavedMemoryInput {
  name: string;
  metNote: string;
  caption: string;
  photoDataUrl: string | null;
  destinations: MemoryDestination[];
}

/** The fields the library's edit form can change — all optional, so a
 *  single field (a freshly edited picture, say) can be sent on its own. */
export interface MemoryEdits {
  name?: string;
  metNote?: string;
  caption?: string;
  destinations?: MemoryDestination[];
  /** A freshly edited picture: crop, rotate and filter all land here. */
  photoDataUrl?: string | null;
}

/** The whole library, fetched once from the API and kept in memory. */
const memories = createResource<SavedMemoryCard[]>(
  () => apiGet<SavedMemoryCard[]>("/memories"),
  []
);

export function useMemoriesState(): ResourceState<SavedMemoryCard[]> {
  return useResource(memories);
}

export function reloadSavedMemories(): Promise<void> {
  return memories.reload();
}

function replaceCard(id: string, next: SavedMemoryCard) {
  memories.setData(memories.getState().data.map((card) => (card.id === id ? next : card)));
}

/** Keeps a freshly captured photo. Shown straight away, then confirmed by the API. */
export async function addSavedMemory(input: SavedMemoryInput): Promise<SavedMemoryCard> {
  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const optimistic: SavedMemoryCard = {
    id: optimisticId,
    ...input,
    destinations: [...input.destinations],
    createdAt: new Date().toISOString(),
  };
  memories.setData([optimistic, ...memories.getState().data]);

  try {
    const saved = await apiPost<SavedMemoryCard>("/memories", input);
    replaceCard(optimisticId, saved);
    return saved;
  } catch (error) {
    memories.setData(memories.getState().data.filter((card) => card.id !== optimisticId));
    throw error;
  }
}

/** Applies editable changes to a saved memory, keeping its id and createdAt. */
export async function updateSavedMemory(id: string, edits: MemoryEdits): Promise<SavedMemoryCard> {
  const previous = memories.getState().data;
  memories.setData(previous.map((card) => (card.id === id ? { ...card, ...edits } : card)));

  try {
    const saved = await apiPatch<SavedMemoryCard>(`/memories/${id}`, edits);
    replaceCard(id, saved);
    return saved;
  } catch (error) {
    memories.setData(previous);
    throw error;
  }
}

/** Removes a saved memory from the library. */
export async function removeSavedMemory(id: string): Promise<void> {
  const previous = memories.getState().data;
  memories.setData(previous.filter((card) => card.id !== id));

  try {
    await apiDelete(`/memories/${id}`);
  } catch (error) {
    memories.setData(previous);
    throw error;
  }
}
