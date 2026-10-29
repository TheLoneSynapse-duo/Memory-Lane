/**
 * The live voice session, wrapped as a tiny store.
 *
 * The page asks the Memory Lane API for a short-lived AssemblyAI token, then
 * streams the microphone as 24 kHz PCM16 over the Voice Agent API WebSocket
 * and plays the reply back. Capture and playback each run in their own
 * AudioContext with a resampling worklet, so a browser that refuses to open a
 * context at 24 kHz still sounds right — the same pipeline the AssemblyAI
 * browser starter uses, kept here so the app needs no build step for it.
 *
 * The agent's tools are answered here too: it emits tool.call, we run it
 * against the Memory Lane API (agentTools.ts), and reply with tool.result once
 * the current reply has finished, which is what the API expects.
 *
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { apiGet, apiPost, describeError } from "./api";
import { TOOL_ACTIVITY, runAgentTool, type ToolResult } from "./agentTools";
import { syncProfileWithService } from "./profile";

const WIRE_RATE = 24_000;

export type AgentStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export interface AgentLine {
  id: number;
  who: "you" | "agent";
  text: string;
  /** Still being transcribed; shown faintly until it settles. */
  partial: boolean;
}

/** The agent configuration as an inline session declares it. */
export interface InlineSession {
  system_prompt: string;
  greeting: string;
  output: { voice: string };
  input?: { keyterms?: string[] };
  tools: unknown[];
}

export interface AgentConfig {
  enabled: boolean;
  /** "stored" speaks as a published agent; "inline" configures the session here. */
  mode: "stored" | "inline";
  agentId: string | null;
  agentName: string;
  session: InlineSession | null;
  /** Why the assistant is unavailable, when it is. */
  reason: string | null;
}

export interface AgentState {
  status: AgentStatus;
  error: string | null;
  lines: AgentLine[];
  /**
   * Waiting on the companion: they have stopped speaking and the answer has
   * not started yet. The gap that used to be dead air, now shown as a wave.
   */
  thinking: boolean;
  /** A quiet note about what the companion is doing, e.g. "Looking them up…". */
  activity: string | null;
  /** A confirmation after something was saved, shown for a moment. */
  savedNote: string | null;
  muted: boolean;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

let state: AgentState = {
  status: "idle",
  error: null,
  lines: [],
  thinking: false,
  activity: null,
  savedNote: null,
  muted: false,
};

const listeners = new Set<() => void>();

function getState(): AgentState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(next: Partial<AgentState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function useAgent(): AgentState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

let configRequest: Promise<AgentConfig> | null = null;

/** Fetched once; retry by reloading the page. */
export function loadAgentConfig(): Promise<AgentConfig> {
  if (!configRequest) {
    // The greeting, the prompt and the transcription keyterms are all built
    // from the service's copy of the personal details, so hand this device's
    // copy over first. Otherwise a push that failed earlier — say while the
    // API was still on an old build — leaves the call unable to answer
    // "what's my name?" while the screen greets them by it.
    configRequest = syncProfileWithService().then(() => apiGet<AgentConfig>("/agent/config"));
  }
  return configRequest;
}

export function useAgentConfig(): { config: AgentConfig | null; error: string | null } {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadAgentConfig().then(
      (loaded) => {
        if (alive) setConfig(loaded);
      },
      (reason: unknown) => {
        if (alive) setError(describeError(reason));
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  return { config, error };
}

/* ------------------------------------------------------------------ */
/* Audio worklets                                                      */
/* ------------------------------------------------------------------ */

// Mic in, 24 kHz PCM16 out. Resamples inside the worklet so the context can
// keep the device's own rate (Firefox and Safari need that for echo
// cancellation, and Safari ignores a forced rate entirely).
const CAPTURE_WORKLET = `
  class CaptureProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._ratio = sampleRate / ${WIRE_RATE};
      this._pos = 0;
      this._prev = 0;
      this._src = null;
      this._out = null;
    }
    _toPcm(samples, len) {
      const pcm = new Int16Array(len);
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm;
    }
    process(inputs) {
      const ch = inputs[0]?.[0];
      if (!ch) return true;
      if (this._ratio === 1) {
        const pcm = this._toPcm(ch, ch.length);
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        return true;
      }
      const n = ch.length;
      if (!this._src || this._src.length < n + 1) {
        this._src = new Float32Array(n + 1);
        this._out = new Float32Array(Math.ceil((n + 1) / this._ratio) + 2);
      }
      const src = this._src;
      const out = this._out;
      src[0] = this._prev;
      src.set(ch, 1);
      let outLen = 0;
      let pos = this._pos;
      while (pos < n) {
        const i = Math.floor(pos);
        const frac = pos - i;
        out[outLen++] = src[i] + (src[i + 1] - src[i]) * frac;
        pos += this._ratio;
      }
      this._pos = pos - n;
      this._prev = ch[n - 1];
      if (outLen) {
        const pcm = this._toPcm(out, outLen);
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
      }
      return true;
    }
  }
  registerProcessor('capture', CaptureProcessor);
`;

// A ring buffer rather than one AudioBufferSource per chunk, which drifts and
// clicks under jitter. Posting 'stop' empties it for barge-in.
const PLAYBACK_WORKLET = `
  class PlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._ring = new Float32Array(sampleRate * 30);
      this._writePos = 0;
      this._readPos = 0;
      this._available = 0;
      this._step = ${WIRE_RATE} / sampleRate;
      this._rsPos = 0;
      this._rsPrev = 0;
      this._drained = false;
      this.port.onmessage = (e) => {
        if (e.data === 'stop') {
          this._writePos = this._readPos = this._available = 0;
          this._rsPos = this._rsPrev = 0;
          return;
        }
        const int16 = new Int16Array(e.data);
        if (!int16.length) return;
        if (this._drained) {
          this._rsPrev = 0;
          this._rsPos = 0;
          this._drained = false;
        }
        if (this._step === 1) {
          for (let i = 0; i < int16.length; i++) this._push(int16[i] / 32768);
          return;
        }
        const n = int16.length;
        let pos = this._rsPos;
        while (pos < n) {
          const i = Math.floor(pos);
          const frac = pos - i;
          const a = i === 0 ? this._rsPrev : int16[i - 1] / 32768;
          const b = int16[i] / 32768;
          this._push(a + (b - a) * frac);
          pos += this._step;
        }
        this._rsPos = pos - n;
        this._rsPrev = int16[n - 1] / 32768;
      };
    }
    _push(v) {
      if (this._available < this._ring.length) {
        this._ring[this._writePos] = v;
        this._writePos = (this._writePos + 1) % this._ring.length;
        this._available++;
      }
    }
    process(inputs, outputs) {
      const output = outputs[0];
      const out = output[0];
      const cap = this._ring.length;
      for (let i = 0; i < out.length; i++) {
        if (this._available > 0) {
          out[i] = this._ring[this._readPos];
          this._readPos = (this._readPos + 1) % cap;
          this._available--;
        } else {
          out[i] = 0;
          this._drained = true;
        }
      }
      for (let ch = 1; ch < output.length; ch++) output[ch].set(out);
      return true;
    }
  }
  registerProcessor('playback', PlaybackProcessor);
`;

async function addWorklet(
  ctx: AudioContext,
  code: string,
  name: string
): Promise<AudioWorkletNode> {
  const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  return new AudioWorkletNode(ctx, name);
}

/* ------------------------------------------------------------------ */
/* Levels — what the panel's wave draws                                */
/* ------------------------------------------------------------------ */

let micLevel = 0;
let replyLevel = 0;

/** RMS of a chunk of 16-bit PCM: ~0 for a quiet room, 0.2+ for speech. */
function rmsOf(bytes: Uint8Array): number {
  if (bytes.byteLength < 4 || bytes.byteOffset % 2 !== 0) return 0;
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] / 0x8000;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

/** Rises with the voice, falls behind it — the bars follow rather than flicker. */
function trackLevel(current: number, bytes: Uint8Array): number {
  const target = Math.min(1, rmsOf(bytes) * 2.5);
  return Math.max(target, current * 0.9);
}

/**
 * Live amplitude, 0 to 1, on both sides of the call. Read by the wave on every
 * animation frame, deliberately outside React so a moving meter never re-renders
 * the transcript beside it.
 */
export function agentLevels(): { mic: number; reply: number } {
  return { mic: micLevel, reply: replyLevel };
}

/* ------------------------------------------------------------------ */
/* Session internals                                                   */
/* ------------------------------------------------------------------ */

let ws: WebSocket | null = null;
let captureCtx: AudioContext | null = null;
let playbackCtx: AudioContext | null = null;
let captureNode: AudioWorkletNode | null = null;
let playbackNode: AudioWorkletNode | null = null;
let micStream: MediaStream | null = null;

let active = false;
let ready = false;
let endTimer: number | null = null;

let lastEvent: string | null = null;
let pendingTools: { call_id: string; result: ToolResult }[] = [];

let lineSeq = 0;
const partialIds = new Map<"you" | "agent", number>();
let liveReply: string | null = null;
let printedReply: string | null = null;
let agentDraft = "";

const MAX_LINES = 60;

function withLine(line: AgentLine): void {
  const lines = [...state.lines, line];
  update({ lines: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines });
}

function upsertPartial(who: "you" | "agent", text: string): void {
  const id = partialIds.get(who);
  if (id === undefined) {
    const line: AgentLine = { id: ++lineSeq, who, text, partial: true };
    partialIds.set(who, line.id);
    withLine(line);
    return;
  }
  update({
    lines: state.lines.map((line) => (line.id === id ? { ...line, text, partial: true } : line)),
  });
}

function finishLine(who: "you" | "agent", text: string): void {
  const id = partialIds.get(who);
  partialIds.delete(who);
  if (id === undefined) {
    withLine({ id: ++lineSeq, who, text, partial: false });
    return;
  }
  update({
    lines: state.lines.map((line) => (line.id === id ? { ...line, text, partial: false } : line)),
  });
}

function dropPartial(who: "you" | "agent"): void {
  const id = partialIds.get(who);
  if (id === undefined) return;
  partialIds.delete(who);
  update({ lines: state.lines.filter((line) => line.id !== id) });
}

// Deltas arrive with a leading space sometimes and without it other times, so
// add one only when neither side has one and the delta is not punctuation.
const ATTACHES_LEFT = /^[.,!?;:%°)\]}>…'"’”]/;
const NO_SPACE_AFTER = /[([{$/\-'"‘“]$/;

function appendDelta(text: string, delta: string): string {
  if (!delta) return text;
  if (!text) return delta;
  if (/^\s/.test(delta) || /\s$/.test(text)) return text + delta;
  if (ATTACHES_LEFT.test(delta) || NO_SPACE_AFTER.test(text)) return text + delta;
  return `${text} ${delta}`;
}

function sessionFor(config: AgentConfig): Record<string, unknown> {
  if (config.mode === "stored" && config.agentId) return { agent_id: config.agentId };
  return (config.session ?? {}) as unknown as Record<string, unknown>;
}

function handleMessage(raw: string): void {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (String(message.type ?? "")) {
    case "session.ready":
      ready = true;
      update({ status: "listening", error: null, thinking: false });
      break;

    case "input.speech.started":
      // Barge-in: empty the ring buffer so the agent stops mid-word.
      playbackNode?.port.postMessage("stop");
      lastEvent = "input.speech.started";
      update({ status: "listening", thinking: false });
      break;

    case "input.speech.stopped":
      // They have finished: from here until reply.started it is the
      // companion's turn, and the wave shows the wait instead of hiding it.
      lastEvent = "input.speech.stopped";
      update({ thinking: true });
      break;

    case "reply.started":
      lastEvent = "reply.started";
      update({ status: "speaking", thinking: false });
      break;

    case "reply.audio": {
      const data = String(message.data ?? "");
      if (!data) break;
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      replyLevel = trackLevel(replyLevel, bytes);
      playbackNode?.port.postMessage(bytes.buffer, [bytes.buffer]);
      break;
    }

    case "reply.done":
      if (message.status === "interrupted") playbackNode?.port.postMessage("stop");
      lastEvent = "reply.done";
      // A tool that is still running or still owed means the companion is
      // working rather than waiting to be spoken to.
      update({
        status: "listening",
        thinking: pendingTools.length > 0 || state.activity !== null,
      });
      flushTools();
      break;

    // `text` is the full transcript so far, so it replaces.
    case "transcript.user.delta":
      upsertPartial("you", String(message.text ?? ""));
      break;

    case "transcript.user":
      finishLine("you", String(message.text ?? ""));
      // Belt and braces: some sessions settle a turn without emitting
      // input.speech.stopped, and a finished question is still the moment the
      // companion starts working.
      if (state.status !== "speaking") update({ thinking: true });
      break;

    // `delta` is the next word only, so it appends.
    case "transcript.agent.delta": {
      const replyId = typeof message.reply_id === "string" ? message.reply_id : null;
      if (replyId && replyId === printedReply) break;
      if (replyId !== liveReply) {
        liveReply = replyId;
        agentDraft = "";
        dropPartial("agent");
      }
      agentDraft = appendDelta(agentDraft, String(message.delta ?? ""));
      upsertPartial("agent", agentDraft);
      break;
    }

    case "transcript.agent":
      printedReply = typeof message.reply_id === "string" ? message.reply_id : printedReply;
      agentDraft = "";
      finishLine("agent", String(message.text ?? ""));
      break;

    case "tool.call": {
      const callId = String(message.call_id ?? "");
      const name = String(message.name ?? "");
      const args = (message.arguments ?? {}) as ToolResult;
      void answerTool(callId, name, args);
      break;
    }

    case "session.ended":
      endSession();
      break;

    case "session.error":
    case "error":
      fail(String(message.message ?? "The assistant ran into a problem."));
      break;

    default:
      // Frames the UI does not need (audio counters, keep-alives, …).
      break;
  }
}

async function answerTool(callId: string, name: string, args: ToolResult): Promise<void> {
  update({ activity: TOOL_ACTIVITY[name] ?? "One moment…", savedNote: null });

  let result: ToolResult;
  try {
    result = await runAgentTool(name, args);
  } catch (error) {
    result = { error: describeError(error) };
  }

  if (!active || !ws) return;

  if (result.saved) {
    update({ savedNote: `${String(result.about ?? "That")} is in your memory library now.` });
  }
  if (result.added) {
    update({ savedNote: `Added to today: ${String(result.what ?? "your reminder")}.` });
  }
  if (result.cancelled) {
    update({ savedNote: `Taken off today: ${String(result.what ?? "your reminder")}.` });
  }
  if (result.moved) {
    update({
      savedNote: `${String(result.what ?? "That")} is now at ${String(result.to ?? "a new time")}.`,
    });
  }

  update({ activity: null });
  pendingTools.push({ call_id: callId, result });
  flushTools();
}

// Tool results go back only once reply.done is the latest event received —
// not earlier (the agent is mid-turn), not later (a new turn has started).
function flushTools(): void {
  if (lastEvent !== "reply.done" || !pendingTools.length) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  for (const tool of pendingTools) {
    ws.send(
      JSON.stringify({
        type: "tool.result",
        call_id: tool.call_id,
        result: JSON.stringify(tool.result),
      })
    );
  }
  pendingTools = [];
}

function teardown(): void {
  micLevel = 0;
  replyLevel = 0;

  if (endTimer !== null) {
    window.clearTimeout(endTimer);
    endTimer = null;
  }

  const socket = ws;
  ws = null;
  if (socket && socket.readyState <= WebSocket.OPEN) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }

  try {
    captureNode?.disconnect();
  } catch {
    /* node already gone */
  }
  try {
    playbackNode?.disconnect();
  } catch {
    /* node already gone */
  }
  captureNode = null;
  playbackNode = null;

  micStream?.getTracks().forEach((track) => track.stop());
  micStream = null;

  void captureCtx?.close().catch(() => {});
  void playbackCtx?.close().catch(() => {});
  captureCtx = null;
  playbackCtx = null;

  active = false;
  ready = false;
  lastEvent = null;
  pendingTools = [];
  liveReply = null;
  printedReply = null;
  agentDraft = "";
  partialIds.clear();
}

function endSession(): void {
  teardown();
  update({ status: "idle", error: null, activity: null, thinking: false, muted: false });
}

function fail(message: string): void {
  teardown();
  update({ status: "error", error: message, activity: null, thinking: false, muted: false });
}

function microphoneMessage(error: unknown): string {
  if (!(error instanceof DOMException)) return describeError(error);
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was blocked. Allow it for this site in your browser settings, then try again.";
    case "NotFoundError":
      return "No microphone was found. Check that one is connected and try again.";
    case "NotReadableError":
      return "The microphone is busy in another app. Close it and try again.";
    default:
      return "The assistant could not start listening. Please try again.";
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export async function startAgent(config: AgentConfig): Promise<void> {
  if (active) return;

  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    update({
      status: "error",
      error:
        "This browser cannot use the microphone here. A secure connection (https or localhost) and a modern browser are needed.",
    });
    return;
  }

  active = true;
  update({
    status: "connecting",
    error: null,
    lines: [],
    thinking: false,
    activity: null,
    savedNote: null,
    muted: false,
  });

  // Open the audio contexts inside the click that started the session — that
  // is the one moment a browser lets audio begin.
  let capture: AudioContext;
  let playback: AudioContext;
  try {
    capture = new AudioContext();
    playback = new AudioContext();
    captureCtx = capture;
    playbackCtx = playback;
    await Promise.all([capture.resume(), playback.resume()]);
  } catch {
    fail("This browser could not start the audio engine.");
    return;
  }

  // The token is the one step that fails for reasons the person cannot see
  // (a missing key, a bad connection), so it gets a sentence of its own rather
  // than the API's generic server-error text.
  let token: string;
  try {
    ({ token } = await apiPost<{ token: string }>("/agent/token"));
  } catch {
    fail("The assistant could not start just now. Please try again in a moment.");
    return;
  }

  try {
    const playbackNodeLocal = await addWorklet(playback, PLAYBACK_WORKLET, "playback");
    playbackNodeLocal.connect(playback.destination);
    playbackNode = playbackNodeLocal;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // Echo cancellation on so the agent does not hear itself; noise
        // suppression off because the server already cleans the input.
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    micStream = stream;

    const captureNodeLocal = await addWorklet(capture, CAPTURE_WORKLET, "capture");
    capture.createMediaStreamSource(stream).connect(captureNodeLocal);
    captureNode = captureNodeLocal;

    const url = new URL("wss://agents.assemblyai.com/v1/ws");
    url.searchParams.set("token", token);
    const socket = new WebSocket(url);
    ws = socket;

    // The API takes base64 inside JSON, not binary frames.
    captureNodeLocal.port.onmessage = (event: MessageEvent) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      // Measured before the send, so the wave is live even while muted or waiting.
      micLevel = trackLevel(micLevel, bytes);
      if (!ready || socket.readyState !== WebSocket.OPEN) return;
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      socket.send(JSON.stringify({ type: "input.audio", audio: btoa(binary) }));
    };

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "session.update", session: sessionFor(config) }));
    };
    socket.onmessage = (event: MessageEvent) => handleMessage(String(event.data));
    socket.onclose = () => {
      if (ws === socket) endSession();
    };
    socket.onerror = () => fail("The assistant could not connect. Please try again.");
  } catch (error) {
    fail(microphoneMessage(error));
  }
}

export function stopAgent(): void {
  const socket = ws;
  if (socket && socket.readyState === WebSocket.OPEN) {
    // End cleanly so the session record closes; the API answers session.ended.
    socket.send(JSON.stringify({ type: "session.end" }));
    if (endTimer === null) endTimer = window.setTimeout(() => teardown(), 4000);
  } else {
    teardown();
  }

  micStream?.getTracks().forEach((track) => track.stop());
  playbackNode?.port.postMessage("stop");
  ready = false;
  active = false;
  update({ status: "idle", error: null, activity: null, thinking: false, muted: false });
}

export function toggleMute(): void {
  if (!micStream) return;
  const muted = !state.muted;
  micStream.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
  update({ muted });
}

// Sending session.end synchronously here is the only way it survives a tab
// close, and it is what stops the billable resume window.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session.end" }));
    }
  });
}
