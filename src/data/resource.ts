import { useEffect, useSyncExternalStore } from "react";
import { describeError } from "./api";

/**
 * A tiny API-backed store.
 *
 * Each data module in src/data owns one resource: it fetches once, keeps the
 * result in a cache, and republishes it to React through useSyncExternalStore.
 * Components can therefore stay the same shape they were when the data lived in
 * localStorage — they just render `state.data` and react to `state.status`.
 */

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface ResourceState<T> {
  data: T;
  status: LoadStatus;
  error: string | null;
}

export interface Resource<T> {
  subscribe(listener: () => void): () => void;
  getState(): ResourceState<T>;
  /** Replaces the cached data (used for optimistic updates). */
  setData(data: T): void;
  /** Loads once; later calls are no-ops while ready or already in flight. */
  ensureLoaded(): Promise<void>;
  /** Loads again, keeping the current data on screen until it lands. */
  reload(): Promise<void>;
}

export function createResource<T>(loader: () => Promise<T>, initial: T): Resource<T> {
  let state: ResourceState<T> = { data: initial, status: "idle", error: null };
  const listeners = new Set<() => void>();
  let inflight: Promise<void> | null = null;

  function publish() {
    listeners.forEach((listener) => listener());
  }

  function update(next: Partial<ResourceState<T>>) {
    state = { ...state, ...next };
    publish();
  }

  function load(): Promise<void> {
    if (inflight) return inflight;
    if (state.status !== "ready") update({ status: "loading", error: null });
    inflight = loader()
      .then((data) => update({ data, status: "ready", error: null }))
      .catch((error) => update({ status: "error", error: describeError(error) }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    setData(data) {
      update({ data, status: "ready", error: null });
    },
    ensureLoaded() {
      if (state.status === "ready" || state.status === "loading") return Promise.resolve();
      return load();
    },
    reload() {
      return load();
    },
  };
}

/** Subscribes a component to a resource and loads it on first mount. */
export function useResource<T>(resource: Resource<T>, autoLoad = true): ResourceState<T> {
  const state = useSyncExternalStore(resource.subscribe, resource.getState, resource.getState);

  useEffect(() => {
    if (autoLoad) void resource.ensureLoaded();
  }, [resource, autoLoad]);

  return state;
}
