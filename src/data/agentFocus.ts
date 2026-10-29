/**
 * Where the companion asks the screen to go.
 *
 * The companion's tools run in this browser (see agentTools.ts), which is what
 * lets a spoken question also move the app: looking someone up opens their card
 * so the person can see the face while the companion talks about them, and
 * asking to go somewhere — "go to memories" — lands on that screen. A phone
 * call has no screen, and simply never fires this.
 *
 * A tiny store of its own, rather than a field on the voice session, so the
 * screens and the session stay independent: the session writes a request,
 * `App` reads it, and neither has to know about the other.
 */
import { useSyncExternalStore } from "react";

/**
 * Every screen the app can be moved to, named once — the side rail, the bottom
 * bar and the companion's `go_to` tool all speak in these words.
 */
export const AGENT_PAGES = [
  "home",
  "faces",
  "camera",
  "stories",
  "memories",
  "today",
] as const;

export type AgentPage = (typeof AGENT_PAGES)[number];

/** Whether a tool handed over a screen that actually exists. */
export function isAgentPage(value: unknown): value is AgentPage {
  return typeof value === "string" && (AGENT_PAGES as readonly string[]).includes(value);
}

export type AgentFocus =
  | {
      kind: "person";
      personId: string;
      /** Changes on every request, so asking twice opens the card twice. */
      at: number;
    }
  | {
      kind: "page";
      page: AgentPage;
      /** Changes on every request, so asking twice moves the screen twice. */
      at: number;
    };

let focus: AgentFocus | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(): void {
  listeners.forEach((listener) => listener());
}

/** Ask the app to bring one person on screen. */
export function focusPerson(personId: string): void {
  if (!personId) return;
  focus = { kind: "person", personId, at: Date.now() };
  publish();
}

/** Ask the app to move to one of its screens — hands free, mid-conversation. */
export function goToPage(page: AgentPage): void {
  focus = { kind: "page", page, at: Date.now() };
  publish();
}

/** Called once the request has been carried out, so it is not repeated. */
export function clearAgentFocus(): void {
  if (!focus) return;
  focus = null;
  publish();
}

export function useAgentFocus(): AgentFocus | null {
  return useSyncExternalStore(subscribe, () => focus, () => focus);
}
