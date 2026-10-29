import { useSyncExternalStore } from "react";
import { apiGet, apiPost } from "./api";

/**
 * The person using the app — their name, what they like to be called, and a
 * line about them.
 *
 * This is the one piece of data that lives on the device rather than with the
 * rest of the memories: it is needed before anything else has loaded (the app
 * opens with "Hello, {name}"), and there is no account to store it against.
 */
export interface Profile {
  /** Full name, as they type it during the welcome step. */
  name: string;
  /** What they like to be called — falls back to the first word of `name`. */
  preferredName: string;
  /** An optional line about them, shown with their personal details. */
  about: string;
  /** False until the welcome step has been finished or skipped. */
  onboarded: boolean;
}

const STORAGE_KEY = "memory-lane.profile.v1";

const DEFAULT_PROFILE: Profile = {
  name: "",
  preferredName: "",
  about: "",
  onboarded: false,
};

function read(): Profile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

let state: Profile = typeof window === "undefined" ? DEFAULT_PROFILE : read();
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Applies a change to the personal details, keeps it on the device, and hands
 * it to the service so the companion knows who it is talking to.
 *
 * The server copy is what answers "what's my name?" on a call, so a failed
 * push is retried the next time anything is saved rather than reported.
 */
export function saveProfile(patch: Partial<Profile>): void {
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* A full or private browser: the change still applies for this visit. */
  }
  publish();
  void pushToService();
}

/** Sends the whole profile; the service stores it as-is. */
async function pushToService(): Promise<void> {
  try {
    await apiPost("/profile", {
      name: state.name,
      preferredName: state.preferredName,
      about: state.about,
    });
  } catch {
    /* The device copy is the one the app greets with; the rest retries later. */
  }
}

/**
 * Hands this device's copy to the service before the companion is configured.
 *
 * The greeting and system prompt of a call are built from the service's copy,
 * so a push that never landed (a server that was restarting, or an old build
 * of it) would leave the companion answering "I don't know your name" while
 * the greeting on screen says hello. Nothing is owed here: pushToService
 * already swallows its own failures, and the call simply goes ahead.
 */
export async function syncProfileWithService(): Promise<void> {
  if (!state.name.trim()) return;
  await pushToService();
}

let hydrated = false;

/**
 * Brings the device and the service into step once at start-up.
 *
 * The device wins when it has a name — it is what opened the app, and it is
 * the copy the greeting uses — so a name given on this device is pushed up and
 * the companion has it without anyone having to retype it. A device with no
 * name (new browser, cleared cache) takes whatever the service already knows.
 */
export function hydrateProfileFromService(): void {
  if (hydrated) return;
  hydrated = true;
  void apiGet<Partial<Profile>>("/profile")
    .then((remote) => {
      if (state.name.trim()) {
        // This device already knows them: make sure the companion does too.
        void pushToService();
        return;
      }
      if (!remote) return;
      const name = typeof remote.name === "string" ? remote.name : "";
      if (!name.trim()) return;
      // Written straight into the store: this is a copy, not an edit, and it
      // must not bounce straight back up to the service.
      state = {
        ...state,
        name,
        preferredName: typeof remote.preferredName === "string" ? remote.preferredName : "",
        about: typeof remote.about === "string" ? remote.about : "",
        // They have already introduced themselves; do not ask again.
        onboarded: true,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* A full or private browser: the change still applies for this visit. */
      }
      publish();
    })
    .catch(() => {
      /* Offline is a normal state; the greeting still works from the device. */
    });
}

export function getProfile(): Profile {
  return state;
}

/**
 * Forgets this device's copy — used when signing out, so the next person on
 * this browser starts clean rather than inheriting the previous person's
 * name. Their own account gives their name back on the next sign-in.
 */
export function clearProfile(): void {
  state = { ...DEFAULT_PROFILE };
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
  publish();
}

/** Subscribes a component to the personal details. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getProfile, getProfile);
}

/** The single word to greet them with — "Margaret" from "Margaret Hale". */
export function greetingName(profile: Profile): string {
  const name = (profile.preferredName || profile.name).trim();
  return name ? name.split(/\s+/)[0] : "";
}

/** Up to two letters for the avatar, from the name they gave. */
export function initials(profile: Profile): string {
  const parts = (profile.preferredName || profile.name).trim().split(/\s+/);
  if (!parts[0]) return "Hi";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
