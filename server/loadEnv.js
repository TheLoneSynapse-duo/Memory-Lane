/**
 * Minimal `.env` loader for the Memory Lane API.
 *
 * Node reads the environment but does not load a file for it, and the voice
 * assistant needs a few values (the AssemblyAI key, an optional agent id) that
 * should never be committed. One `KEY=value` per line, `#` starts a comment,
 * surrounding quotes are optional. Anything already set in the real
 * environment wins, so hosting platforms and one-off shell overrides still
 * take precedence over the file.
 *
 * Importing this module loads the file as a side effect, which is early enough
 * for everything that reads `process.env` at request time.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv(file = path.join(here, "..", ".env")) {
  if (!existsSync(file)) return;

  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (key in process.env) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadEnv();
