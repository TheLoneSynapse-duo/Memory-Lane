import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { createResource, useResource, type ResourceState } from "./resource";

export type StoryScene = "cake" | "garden" | "tea" | "wedding" | "robin" | "sunday";

export interface Story {
  id: string;
  title: string;
  context: string;
  story: string;
  scene: StoryScene;
  /** Ready-to-use CSS gradient for the story's illustration panel. */
  wash: string;
  /** A photo chosen from the device, which stands in for the illustration. */
  photoDataUrl?: string | null;
}

/** The editable fields of a story — everything except its id. */
export interface StoryInput {
  title: string;
  context: string;
  story: string;
  scene: StoryScene;
  /** A photo from the device, or null to show the drawn picture instead. */
  photoDataUrl: string | null;
}

/**
 * The colour each illustration ships with. The server only accepts these six
 * gradients, so choosing a scene chooses its colour too.
 */
export const SCENE_WASHES: Record<StoryScene, string> = {
  cake: "linear-gradient(to bottom right, #fbe3b8, #f6d3ae, #eebf9d)",
  garden: "linear-gradient(to bottom right, #e9edd6, #dde6c1, #c9d9a0)",
  tea: "linear-gradient(to bottom right, #f4e7cd, #ecd8b6, #e1c69d)",
  wedding: "linear-gradient(to bottom right, #f6d9d2, #efc5bb, #e3ac9d)",
  robin: "linear-gradient(to bottom right, #e7dfd1, #dbd0bb, #c9ba9c)",
  sunday: "linear-gradient(to bottom right, #f2e0c6, #e8d0ae, #dabb8d)",
};

export const SCENE_ORDER: StoryScene[] = [
  "cake",
  "garden",
  "tea",
  "wedding",
  "robin",
  "sunday",
];

const stories = createResource<Story[]>(() => apiGet<Story[]>("/stories"), []);

export function useStoriesState(): ResourceState<Story[]> {
  return useResource(stories);
}

export function reloadStories(): Promise<void> {
  return stories.reload();
}

/** The same shape the server builds, so the optimistic card matches the saved one. */
function optimisticStory(id: string, input: StoryInput, previous?: Story): Story {
  return {
    id,
    title: input.title.trim(),
    context: input.context.trim(),
    story: input.story.trim(),
    scene: input.scene,
    // Keep a story's own colour when its scene did not change.
    wash:
      previous && previous.scene === input.scene ? previous.wash : SCENE_WASHES[input.scene],
    photoDataUrl: input.photoDataUrl ?? null,
  };
}

/** Adds a story to the shelf. */
export async function addStory(input: StoryInput): Promise<Story> {
  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previous = stories.getState().data;
  stories.setData([...previous, optimisticStory(optimisticId, input)]);

  try {
    const saved = await apiPost<Story>("/stories", input);
    stories.setData(
      stories.getState().data.map((story) => (story.id === optimisticId ? saved : story))
    );
    return saved;
  } catch (error) {
    stories.setData(previous);
    throw error;
  }
}

/** Rewrites a story that is already on the shelf. */
export async function updateStory(id: string, input: StoryInput): Promise<Story> {
  const previous = stories.getState().data;
  stories.setData(
    previous.map((story) => (story.id === id ? optimisticStory(id, input, story) : story))
  );

  try {
    const saved = await apiPatch<Story>(`/stories/${id}`, input);
    stories.setData(stories.getState().data.map((story) => (story.id === id ? saved : story)));
    return saved;
  } catch (error) {
    stories.setData(previous);
    throw error;
  }
}

/** Takes a story off the shelf. */
export async function removeStory(id: string): Promise<void> {
  const previous = stories.getState().data;
  stories.setData(previous.filter((story) => story.id !== id));

  try {
    await apiDelete(`/stories/${id}`);
  } catch (error) {
    stories.setData(previous);
    throw error;
  }
}
