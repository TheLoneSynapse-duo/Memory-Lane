/** Starts the Memory Lane API. */
import "./loadEnv.js"; // loads .env before anything reads process.env
import { createApp } from "./app.js";
import { ensureDataFile } from "./store.js";
import { isCloudEnabled, verifyCloudSetup } from "./supabase.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

// Cloud mode needs its tables (and a photos bucket) before the first request.
if (isCloudEnabled()) {
  try {
    await verifyCloudSetup();
  } catch (error) {
    console.error(`[memory-lane] ${error.message}`);
    process.exit(1);
  }
}

const dataFile = ensureDataFile();
const app = createApp();

app.listen(port, host, () => {
  console.log(`Memory Lane API listening on http://localhost:${port}`);
  console.log(`  health : http://localhost:${port}/api/health`);
  console.log(`  store  : ${dataFile}`);
  console.log(
    isCloudEnabled()
      ? "  login  : on — each person signs in and keeps their own memories"
      : "  login  : off — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for per-user storage"
  );
  console.log(
    process.env.ASSEMBLYAI_API_KEY
      ? "  voice  : the companion is ready (see .env for AGENT_ID)"
      : "  voice  : off — add ASSEMBLYAI_API_KEY to .env to switch it on"
  );
});
