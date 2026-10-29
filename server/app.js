/**
 * Memory Lane API — the backend behind the Memory Lane frontend.
 *
 * Every screen of the app is served from here: the home reflections, the
 * people, the face matcher, the memory library, the photo stories and today's
 * schedule. Run `npm run build` first and this same server will also serve the
 * built frontend from dist/, so one process can host the whole app.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { authGuard, authRouter } from "./auth.js";
import { HttpError } from "./http.js";
import { offloadPhotos, photosRouter } from "./photos.js";
import agentRouter from "./routes/agent.js";
import eventsRouter from "./routes/events.js";
import facesRouter from "./routes/faces.js";
import homeRouter from "./routes/home.js";
import memoriesRouter from "./routes/memories.js";
import peopleRouter from "./routes/people.js";
import profileRouter from "./routes/profile.js";
import scheduleRouter from "./routes/schedule.js";
import storiesRouter from "./routes/stories.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "dist");

/** Lets the Vite dev server (and file:// style tools) call the API directly. */
function cors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function logRequests(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
  });
  next();
}

/**
 * The app used by both the server bootstrap and the integration checks.
 */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(cors);
  app.use(express.json({ limit: "25mb" }));
  if (process.env.NODE_ENV !== "test") app.use(logRequests);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "memory-lane-api",
      version: 1,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Who is calling: with Supabase configured, everything under /api except
  // /api/auth/* and /api/health needs the session cookie, and the request is
  // then run as that user. Without it, this is a no-op (local file mode).
  app.use("/api/auth", authRouter);
  app.use("/api", authGuard);

  // Photos travel as data URLs in, and come back as /api/photos/... out.
  app.use("/api", offloadPhotos);
  app.use("/api/photos", photosRouter);

  app.use("/api/profile", profileRouter);
  app.use("/api/home", homeRouter);
  app.use("/api/people", peopleRouter);
  app.use("/api/faces", facesRouter);
  app.use("/api/memories", memoriesRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/agent", agentRouter);

  // Anything still under /api is a genuine 404.
  app.use("/api", (req, res, next) => {
    next(new HttpError(404, `Unknown API route: ${req.method} ${req.originalUrl}`));
  });

  // The built frontend, when it exists (npm run build).
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(clientDir, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((req, res) => {
    res.status(404).json({
      error: { status: 404, message: `Nothing here: ${req.method} ${req.originalUrl}` },
    });
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((error, req, res, next) => {
    const status = Number(error?.status ?? error?.statusCode ?? 500);
    if (status >= 500) console.error("[memory-lane] request failed:", error);

    const message =
      status === 413
        ? "That photo is too large to save — try a smaller one."
        : status >= 500
          ? "Something went wrong on the memory service."
          : error.message;

    res.status(status).json({ error: { status, message } });
  });

  return app;
}
