/**
 * Who is signed in — and whether this server needs a sign-in at all.
 *
 * The server decides: GET /api/auth/me answers `{ auth: "disabled" }` when
 * everything lives in one local db.json (the local single-user
 * behaviour), or `{ auth: "enabled", user }` once per-user Supabase storage
 * is switched on. The page asks once at start-up and shows the sign-in
 * screen only when the server says accounts exist.
 */
import { useSyncExternalStore } from "react";
import { apiGet, apiPost, setUnauthorizedHandler } from "./api";
import { clearProfile } from "./profile";

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthState =
  /** Asking the server — a quiet splash while it answers. */
  | { status: "checking" }
  /** No sign-in needed on this server. */
  | { status: "open" }
  /** Every memory is behind a login, and nobody is in yet. */
  | { status: "locked"; user: AuthUser | null }
  /** Signed in — this person's own memories are the ones loading. */
  | { status: "signed-in"; user: AuthUser };

let state: AuthState = { status: "checking" };
const listeners = new Set<() => void>();

function publish(): void {
  listeners.forEach((listener) => listener());
}

function set(next: AuthState): void {
  state = next;
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuth(): AuthState {
  return state;
}

/** Subscribes a component to the sign-in state. */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuth, getAuth);
}

/** Asks the server whether a login is needed, and who is in, if anyone. */
export async function loadAuth(): Promise<void> {
  try {
    const reply = await apiGet<{ auth: "disabled" | "enabled"; user: AuthUser | null }>(
      "/auth/me"
    );
    if (reply.auth === "disabled") set({ status: "open" });
    else if (reply.user) set({ status: "signed-in", user: reply.user });
    else set({ status: "locked", user: null });
  } catch {
    // The service is unreachable (still starting, or offline). Let the app
    // open — its own screens explain what went wrong — rather than showing a
    // login wall for a server that may simply be waking up.
    if (state.status === "checking") set({ status: "open" });
  }
}

/** Email + password sign-in. Throws something worth showing on failure. */
export async function signIn(email: string, password: string): Promise<void> {
  await apiPost("/auth/login", { email, password });
  await loadAuth();
}

/** Creates an account and signs straight in. */
export async function createAccount(email: string, password: string): Promise<void> {
  await apiPost("/auth/register", { email, password });
  await loadAuth();
}

/** Signs out. A full reload clears every screen's cached memories. */
export async function signOut(): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } catch {
    // Even if the call failed the reload resets the page; the cookie, if it
    // survived, simply signs the next visit back in.
  }
  // The device-local greeting belongs to whoever was signed in — the next
  // person on this browser must not inherit it, and this user's own account
  // restores theirs the moment they sign back in.
  clearProfile();
  window.location.reload();
}

// A 401 from any screen means the session expired mid-use — ask again, so
// the sign-in screen appears instead of a wall of load errors.
setUnauthorizedHandler(() => {
  void loadAuth();
});
