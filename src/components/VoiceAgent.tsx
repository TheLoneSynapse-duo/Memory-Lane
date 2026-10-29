import { useEffect, useRef, useState } from "react";
import {
  startAgent,
  stopAgent,
  toggleMute,
  useAgent,
  useAgentConfig,
  type AgentState,
} from "../data/voiceAgent";
import { AgentIcon, CheckIcon, CloseIcon, MicIcon, MicOffIcon } from "./icons";
import VoiceWave, { type WaveMode } from "./VoiceWave";

type Panel = "closed" | "consent" | "live";

const STATUS_LABEL: Record<AgentState["status"], string> = {
  idle: "Ready",
  connecting: "Getting ready",
  listening: "Listening",
  speaking: "Speaking",
  error: "Something went wrong",
};

const STATUS_TONE: Record<AgentState["status"], string> = {
  idle: "bg-sand-deep text-ink",
  connecting: "bg-ochre-soft text-ochre-deep",
  listening: "bg-sage text-ink",
  speaking: "bg-ochre-soft text-ochre-deep",
  error: "bg-ochre-soft text-destructive",
};

/**
 * What the wave should draw: the microphone, the reply, or the pause in
 * between while the companion works on an answer. Nothing but the live call
 * gets a wave — an ended or failed session has nothing to show.
 */
function waveModeFor(state: AgentState): WaveMode | null {
  if (state.status === "connecting") return "connecting";
  if (state.status !== "listening" && state.status !== "speaking") return null;
  if (state.thinking || state.activity) return "thinking";
  return state.status === "speaking" ? "speaking" : "listening";
}

/**
 * The companion, as a button in the corner of every screen.
 *
 * It asks for the microphone before anything starts — the consent step is the
 * only way the session opens, so nothing is ever listened to by surprise — and
 * shows what is being said while it happens.
 */
export default function VoiceAgent() {
  const state = useAgent();
  const { config, error: configError } = useAgentConfig();
  const [panel, setPanel] = useState<Panel>("closed");
  const [starting, setStarting] = useState(false);
  const [micPermission, setMicPermission] = useState<string>("unknown");
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const live =
    state.status === "connecting" || state.status === "listening" || state.status === "speaking";

  // Move focus into the panel when it opens, so keyboard and screen-reader
  // users land where the conversation starts.
  useEffect(() => {
    if (panel === "closed") return;
    focusRef.current?.focus();
  }, [panel]);

  // Keeps the newest line in view as the conversation grows.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [state.lines]);

  // A previously denied permission is worth knowing about before we ask again.
  useEffect(() => {
    if (panel !== "consent" || !navigator.permissions?.query) return;
    let alive = true;
    navigator.permissions
      .query({ name: "microphone" } as PermissionDescriptor)
      .then((status) => {
        if (alive) setMicPermission(status.state);
      })
      .catch(() => {
        /* Browser does not report it; the ask itself will tell us. */
      });
    return () => {
      alive = false;
    };
  }, [panel]);

  const unavailable =
    configError ??
    (config && !config.enabled
      ? config.reason ?? "The voice assistant is not set up yet."
      : null);

  function open() {
    setPanel(live ? "live" : "consent");
  }

  function close() {
    // Closing the panel ends the call: nobody should keep being listened to
    // after the screen is dismissed.
    if (live || state.status === "error") stopAgent();
    setPanel("closed");
  }

  async function allow() {
    if (!config || starting) return;
    setStarting(true);
    setPanel("live");
    await startAgent(config);
    setStarting(false);
  }

  const recent = state.lines.slice(-8);
  const waveMode = waveModeFor(state);

  return (
    <>
      {panel !== "closed" && (
        <div
          role="dialog"
          aria-label="Voice assistant"
          className="animate-fade-up fixed inset-x-4 bottom-44 z-40 mx-auto max-w-md rounded-3xl border border-border bg-card p-5 shadow-xl sm:inset-x-auto sm:right-6 sm:mx-0 sm:w-96 lg:bottom-28"
        >
          {unavailable ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="font-heading text-xl text-ink">Your assistant is not ready</p>
                <button
                  type="button"
                  onClick={() => setPanel("closed")}
                  className="btn-ghost shrink-0 !px-2.5 !py-1.5"
                  aria-label="Close"
                >
                  <CloseIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-3 text-base leading-relaxed text-ink-soft">{unavailable}</p>
            </div>
          ) : panel === "consent" ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="font-heading text-xl text-ink">Talk with your assistant</p>
                <button
                  type="button"
                  onClick={() => setPanel("closed")}
                  className="btn-ghost shrink-0 !px-2.5 !py-1.5"
                  aria-label="Close"
                >
                  <CloseIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-3 text-base leading-relaxed text-ink-soft">
                {config?.agentName ?? "Your assistant"} can listen while you talk, so you can ask
                about your day or the people you love, out loud and in your own time.
              </p>
              <ul className="mt-3 space-y-2 text-base text-ink-soft">
                <li className="flex gap-2">
                  <MicIcon className="mt-1 h-4 w-4 shrink-0 text-terracotta" aria-hidden="true" />
                  It only hears you while this is on, and you can stop whenever you like.
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-terracotta" aria-hidden="true" />
                  If you ask it to remember something, it is kept in your memory library.
                </li>
              </ul>
              <p className="mt-3 text-base text-ink-soft">
                Your browser will ask to use the microphone next.
              </p>

              {micPermission === "denied" && (
                <p role="alert" className="mt-3 rounded-xl border border-ochre bg-ochre-soft p-3 text-base text-ink">
                  Microphone access is blocked for this site. Allow it in your browser&rsquo;s
                  address bar, then come back and try again.
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  ref={focusRef}
                  type="button"
                  onClick={() => void allow()}
                  className="btn-primary"
                  disabled={starting || !config}
                >
                  <MicIcon className="h-6 w-6" aria-hidden="true" />
                  {starting ? "Starting…" : "Allow microphone"}
                </button>
                <button type="button" onClick={() => setPanel("closed")} className="btn-ghost">
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-xl text-ink">
                    {config?.agentName ?? "Your assistant"}
                  </p>
                  <p
                    className={`mt-1.5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${STATUS_TONE[state.status]}`}
                    role="status"
                    aria-live="polite"
                  >
                    {(state.status === "connecting" ||
                      state.status === "listening" ||
                      state.status === "speaking") && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />
                    )}
                    {state.thinking ? "One moment…" : STATUS_LABEL[state.status]}
                  </p>
                </div>
                <button
                  ref={panel === "live" ? focusRef : undefined}
                  type="button"
                  onClick={close}
                  className="btn-ghost shrink-0 !px-2.5 !py-1.5"
                  aria-label="End and close"
                >
                  <CloseIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {waveMode && (
                <div className="mt-4 flex items-center justify-center rounded-2xl bg-sand/60 px-4 py-3">
                  <VoiceWave mode={waveMode} />
                </div>
              )}

              {state.error && (
                <div role="alert" className="mt-4 rounded-2xl border border-ochre bg-ochre-soft p-4 text-base text-ink">
                  <p>{state.error}</p>
                  <button type="button" onClick={() => void allow()} className="btn-secondary mt-3">
                    Try again
                  </button>
                </div>
              )}

              <div
                ref={transcriptRef}
                className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-sand/60 p-3"
                aria-live="polite"
                aria-label="Conversation"
              >
                {recent.length === 0 ? (
                  <p className="text-base text-ink-soft">
                    {state.status === "connecting"
                      ? "Just a moment, getting ready…"
                      : "Say hello whenever you are ready."}
                  </p>
                ) : (
                  recent.map((line) => (
                    <p
                      key={line.id}
                      className={`text-base leading-relaxed ${
                        line.partial ? "text-ink-soft" : "text-ink"
                      }`}
                    >
                      <span className="font-bold">
                        {line.who === "you" ? "You" : config?.agentName ?? "Assistant"}:
                      </span>{" "}
                      {line.text}
                    </p>
                  ))
                )}
              </div>

              {state.activity && (
                <p className="mt-3 text-base text-ink-soft" role="status">
                  {state.activity}
                </p>
              )}

              {state.savedNote && (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-sage px-4 py-3 text-base font-bold text-ink">
                  <CheckIcon className="h-5 w-5 shrink-0 text-terracotta" aria-hidden="true" />
                  {state.savedNote}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={toggleMute} className="btn-ghost" aria-pressed={state.muted}>
                  {state.muted ? (
                    <MicOffIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <MicIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                  {state.muted ? "Unmute" : "Mute me"}
                </button>
                <button type="button" onClick={close} className="btn-secondary">
                  End
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => (panel === "closed" ? open() : close())}
        aria-expanded={panel !== "closed"}
        aria-haspopup="dialog"
        className="fixed bottom-24 right-4 z-40 flex cursor-pointer items-center gap-3 rounded-full border border-terracotta-deep/30 bg-terracotta px-5 py-3.5 font-bold text-white shadow-lg transition-transform duration-150 ease-out hover:bg-terracotta-deep active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:bottom-6 lg:right-6"
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          <AgentIcon className="h-6 w-6" aria-hidden="true" />
          {live && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-white"
              aria-hidden="true"
            />
          )}
        </span>
        {live ? "In a call" : "Ask me"}
      </button>
    </>
  );
}
