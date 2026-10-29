/**
 * Who is calling, and the login screens behind it.
 *
 * With Supabase configured, every /api request except /api/health and
 * /api/auth/* must carry the session cookie set by login. The guard resolves
 * the cookie to a user, loads their document into memory, and runs the rest of
 * the request as that user — store.js reads the user from that context.
 *
 * With no Supabase configuration the guard is a no-op and the app keeps its
 * original behaviour: one local db.json file and no sign-in at all.
 */
import { Router } from "express";
import { asyncHandler, HttpError, text } from "./http.js";
import { preloadDocument, runAsUser } from "./store.js";
import {
  createSession,
  isCloudEnabled,
  registerAccount,
  revokeSession,
  sessionUser,
  signIn,
} from "./supabase.js";

export const SESSION_COOKIE = "ml_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds — matches supabase.js

/** Reads the session cookie without pulling in a cookie parser. */
function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function wantsSecure(req) {
  return req.secure || req.get("x-forwarded-proto") === "https";
}

function setSessionCookie(req, res, token) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (wantsSecure(req)) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(req, res) {
  const attributes = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (wantsSecure(req)) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function requireEmailPassword(body) {
  const email = text(body?.email, { field: "email", max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "That doesn't look like an email address.");
  }
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8) {
    throw new HttpError(400, "Use a password of at least 8 characters.");
  }
  return { email, password };
}

export const authRouter = Router();

/** POST /api/auth/register — create an account and sign straight in. */
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    if (!isCloudEnabled()) throw new HttpError(400, "Sign-in is not enabled on this server.");
    const { email, password } = requireEmailPassword(req.body);
    const user = await registerAccount(email, password);
    const session = await createSession(user);
    setSessionCookie(req, res, session.token);
    res.status(201).json({ user });
  })
);

/** POST /api/auth/login — email + password. */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    if (!isCloudEnabled()) throw new HttpError(400, "Sign-in is not enabled on this server.");
    const { email, password } = requireEmailPassword(req.body);
    const user = await signIn(email, password);
    const session = await createSession(user);
    setSessionCookie(req, res, session.token);
    res.json({ user });
  })
);

/** POST /api/auth/logout — forget the session on both sides. */
authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = readCookies(req)[SESSION_COOKIE];
    if (isCloudEnabled() && token) await revokeSession(token);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  })
);

/**
 * GET /api/auth/me — does this server want a login, and is one active?
 * Always 200 so the frontend can ask without treating "no session" as a fault.
 */
authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!isCloudEnabled()) {
      res.json({ auth: "disabled", user: null });
      return;
    }
    const token = readCookies(req)[SESSION_COOKIE];
    const user = token ? await sessionUser(token) : null;
    res.json({ auth: "enabled", user });
  })
);

/**
 * Guards everything under /api once mounted with app.use("/api", authGuard).
 *
 * On a valid session it preloads the user's document (so store.js can serve
 * reads synchronously) and runs the remaining handlers inside that user's
 * context. Without Supabase configuration it lets every request through —
 * that is the local, single-file mode.
 */
export function authGuard(req, res, next) {
  if (!isCloudEnabled()) return next();

  const token = readCookies(req)[SESSION_COOKIE];
  Promise.resolve(token ? sessionUser(token) : null)
    .then(async (user) => {
      if (!user) throw new HttpError(401, "Please sign in to continue.");
      await preloadDocument(user.id);
      runAsUser(user.id, () => next());
    })
    .catch((error) => next(error.status ? error : new HttpError(500, "Could not check your session.")));
}
