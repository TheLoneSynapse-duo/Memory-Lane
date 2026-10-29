#!/usr/bin/env node
/**
 * Publishes the companion as a stored agent on your AssemblyAI account.
 *
 *   MEMORY_LANE_BASE_URL=https://your-app.example.com npm run agent:publish
 *
 * Why you would want this: a stored agent keeps the prompt and the API key off
 * the client and runs its tools server-side, so the same companion can answer
 * a phone call as well as a browser tab. The tools are the Memory Lane API's
 * own endpoints, so MEMORY_LANE_BASE_URL has to be an address AssemblyAI can
 * reach — a deployed URL, or a tunnel such as ngrok while developing.
 *
 * If you would rather not deal with any of that, skip this script entirely:
 * with no AGENT_ID the app configures the companion inline for the session and
 * the browser answers the tools itself.
 */
import "../loadEnv.js";
import { readDb } from "../store.js";
import { greetingFor, keyterms, persona, systemPromptFor, turnDetection } from "./persona.js";
import { httpTools } from "./tools.js";

const api = process.env.AGENTS_API_BASE || "https://agents.assemblyai.com/v1";

function required(name, hint) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.error(`Missing ${name}. ${hint}`);
    process.exit(1);
  }
  return value;
}

const apiKey = required(
  "ASSEMBLYAI_API_KEY",
  "Get one at https://www.assemblyai.com/dashboard/api-keys and add it to .env."
);
const baseUrl = required(
  "MEMORY_LANE_BASE_URL",
  "It is the public address AssemblyAI calls for the companion's tools, e.g. https://abc123.ngrok.app"
).replace(/\/+$/, "");

/** One AssemblyAI call, with a readable error instead of a stack trace. */
async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(api + path, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`${method} ${path} failed (${response.status}): ${text}`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

const db = readDb();

const agent = {
  name: persona.name,
  system_prompt: systemPromptFor(db),
  greeting: greetingFor(db),
  voice: { voice_id: persona.voice },
  input: {
    format: { encoding: "audio/pcm", sample_rate: 24000 },
    keyterms: keyterms(db),
    turn_detection: turnDetection,
  },
  output: {
    voice: persona.voice,
    format: { encoding: "audio/pcm", sample_rate: 24000 },
    volume: 100,
  },
  tools: httpTools(baseUrl),
};

const explicitId = (process.env.AGENT_ID || "").trim();

if (explicitId) {
  await call(`/agents/${explicitId}`, { method: "PUT", body: agent });
  console.log(`Updated "${agent.name}" as agent ${explicitId}`);
} else {
  // Reuse the agent of this name if it exists, so repeated runs update rather
  // than pile up duplicates.
  const { agents } = await call("/agents");
  const existing = (agents ?? []).find((candidate) => candidate.name === agent.name);

  if (existing) {
    await call(`/agents/${existing.id}`, { method: "PUT", body: agent });
    console.log(`Updated "${agent.name}" as agent ${existing.id}`);
  } else {
    const created = await call("/agents", { method: "POST", body: agent });
    console.log(`Created "${agent.name}" as agent ${created.id}`);
  }
}

console.log("");
console.log("Add this to .env so the app speaks as the stored agent:");
console.log(`  AGENT_ID=${explicitId || "(the id printed above)"}`);
console.log(`Tools point at ${baseUrl}/api/agent/*, so it must stay reachable.`);
