# Memory Lane

A personal photo and memory companion built with React, TypeScript, Vite and
Express. Add your own people, photos, stories, reflections and plans; the app
starts with an empty personal library rather than fictional sample content.

## Running it

Two processes: the API and the frontend.

```bash
npm install

# terminal 1 — the API on http://localhost:4000
npm run server          # or: npm run server:watch   (restarts on change)

# terminal 2 — the app on http://localhost:5173
npm run dev
```

Vite proxies `/api` to `http://localhost:4000`, so the browser only ever talks
to one origin. Point the frontend at a different API with `VITE_API_BASE_URL`.

For a single-process deployment, build the frontend and let Express serve it:

```bash
npm start               # vite build && node server/index.js
# open http://localhost:4000
```

`npm run build` + `npm run server` do the same thing in two steps.

## The backend

`server/` is a lightweight Express app:

```
server/
  index.js          starts the server (PORT, defaults to 4000)
  app.js            middleware, route mounting, static frontend, error handling
  store.js          JSON-file persistence + schedule merge / memory normalisation
  seed.js           creates a clean, empty store for each new account
  http.js           HttpError, async wrapper, input coercion
  loadEnv.js        reads .env for the voice assistant's credentials
  data/db.json      the store, written on first run (git-ignored)
  agent/
    persona.js      who the companion is: its prompt, greeting and voice
    tools.js        the actions it may take, shared by both ways of running it
    publish.js      npm run agent:publish — the companion as a stored agent
  routes/
    agent.js        the voice session, and the companion's tools
    home.js         GET  /api/home  ·  POST/PATCH/DELETE /api/home/moments, reset
    people.js       GET  /api/people, /random, /by-name/:name, /:id  ·  POST /, PATCH /:id
    faces.js        POST /api/faces/candidates
    memories.js     GET/POST/PATCH/DELETE /api/memories
    stories.js      GET  /api/stories, /:id
    schedule.js     GET  /api/schedule, POST/PATCH/DELETE /api/schedule/events
    events.js       GET  /api/events/today, /api/events/upcoming
```

State lives in one JSON document. New accounts begin with empty people, stories,
moments and schedules so each person can add their own content. Photos are
stored as data URLs (the JSON body limit is 25 MB).

### Per-user storage — Supabase (optional)

Without Supabase configured, everything lives in one local `server/data/db.json`:
one shared store with no login, wiped when the host's disk is replaced on redeploy.
This mode is for local development only; use the Supabase setup for separate
accounts and persistent per-user data.
Set two environment variables and the *same server* becomes a real multi-user
app — each person signs in with email and password, their memories live in
their own row, and photographs go to Supabase Storage instead of inside the
JSON.

**Free setup, about ten minutes:**

1. Create a free project at <https://supabase.com> (no credit card).
2. Run the contents of `server/supabase-schema.sql` in the SQL editor
   (Dashboard → SQL Editor → New query → Run).
3. Authentication → Providers → Email: leave **Confirm email** off — the app
   creates accounts itself and no SMTP service is needed.
4. Copy Settings → API into `.env` as `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`.
5. `npm run server`. The boot log prints `login : on`, the photos bucket is
   created automatically, and every new visitor gets a private, empty document
   of their own.

| | Local development mode | Supabase account mode |
| --- | --- | --- |
| Who | one shared store | one row per signed-in person (`documents`) |
| Login | none | email + password, 30-day session cookie |
| Photos | base64 inside the JSON | `photos/<userId>/…`, served via `/api/photos` |
| Survives a redeploy | only with a persistent disk | yes — data lives in Supabase |
| Reads | straight from disk | cached per user, saved on a per-user queue |

How it fits together:

- `server/supabase.js` — the only file that talks to Supabase: documents,
  sessions, accounts and photo uploads (service-role key, server-side only).
- `server/auth.js` — `POST /api/auth/register|login|logout`, `GET
  /api/auth/me`, and the guard that runs every `/api` request as the signed-in
  user. Without Supabase configured the guard is a no-op, so local development
  is unchanged.
- `server/store.js` — routes still call `readDb()`/`mutate()`; in Supabase
  mode those resolve to the current user's cached document (loaded by the
  guard before the handler runs), in file mode to `db.json` as always.
- `server/photos.js` — moves `data:image/…` photos out of the request body
  into Storage, and serves them back only to the person who owns them.

RLS is enabled on both tables with no policies, so the anon and authenticated
can touch nothing; only this server, holding the service role key, reads or
writes. The photos bucket stays private — images are fetched through
`GET /api/photos/<user>/<file>`, which checks the session owns the folder.

> **Note for stored agents:** with login on, `POST /api/agent/*` tools called
> by AssemblyAI's servers need a session cookie they will never have. The
> inline companion (the default) runs its tools in the browser, where the
> cookie is sent normally, and works as before.

### Endpoints

| Method | Path | Used by |
| --- | --- | --- |
| GET | `/api/health` | uptime check |
| GET | `/api/home` | Home — memory of the day + moments worth keeping |
| POST | `/api/home/moments` | Memories — add a moment worth keeping |
| PATCH | `/api/home/moments/:id` | Memories — rewrite a moment |
| DELETE | `/api/home/moments/:id` | Memories — take a moment off the list |
| POST | `/api/home/reset` | clear the current account and restore its empty state |
| GET | `/api/people` | Who is this? — the circle of faces |
| POST | `/api/people` | Who is this? — add a familiar face to the circle |
| GET | `/api/people/random` | a surprise familiar face |
| GET | `/api/people/by-name/:name` | linking a saved photo to a person |
| GET | `/api/people/:id` | one person's card |
| PATCH | `/api/people/:id` | Who is this? — a photo chosen from the device |
| POST | `/api/faces/candidates` | Who is this? — list people to link to a photograph |
| GET | `/api/memories?destination=home\|faces\|stories` | Home library, saved photos, new story photos |
| GET | `/api/memories/:id` | one saved card |
| POST | `/api/memories` | Camera — save a photo |
| PATCH | `/api/memories/:id` | Home — edit a saved memory |
| DELETE | `/api/memories/:id` | remove a saved memory |
| GET | `/api/stories` | Stories — the days to hear again |
| GET | `/api/stories/:id` | a single story |
| GET | `/api/schedule` | Today — default day merged with the user's edits |
| POST | `/api/schedule/events` | Today — add an event |
| PATCH | `/api/schedule/events/:id` | Today — rewrite an event |
| DELETE | `/api/schedule/events/:id` | Today — remove an event |
| GET | `/api/events/today` | the day's untouched defaults |
| GET | `/api/events/upcoming` | Today — coming up |
| GET | `/api/agent/config` | the assistant — how to open a call |
| POST | `/api/agent/token` | the assistant — a single-use session token |
| GET | `/api/agent/now` | companion tool — the day, the date, the time of day |
| GET | `/api/agent/context` | companion tool — today, coming up, memory of the day |
| GET | `/api/agent/person` | companion tool — one person, by name or relationship |
| GET | `/api/agent/memories` | companion tool — search the saved memories |
| POST | `/api/agent/remember` | companion tool — keep a note |
| POST | `/api/agent/edit-memory` | companion tool — correct a memory already saved |
| POST | `/api/agent/today` | companion tool — add a reminder to today |
| POST | `/api/agent/cancel` | companion tool — take a plan off, on any day, keeping the record |
| POST | `/api/agent/move` | companion tool — change when a plan happens, on any day |
| GET | `/api/schedule/changes` | what was moved or taken off, for family to review |

Errors are JSON: `{ "error": { "status": 404, "message": "…" } }`.

## The frontend

Every screen is powered by the API. `src/data/*` holds one small store per
resource (`createResource` in `src/data/resource.ts`), fetched once and shared
with React through `useSyncExternalStore`; `src/data/api.ts` is the only place
that talks to the network.

Writes are optimistic — an added photo, an edited memory or a schedule change
appears immediately, then the server confirms it (or the change is rolled back
and the reason is shown). While a resource is loading or unreachable, the
matching section shows a calm notice with a **Try again** button
(`src/components/DataNotice.tsx`).

Photographs can be linked to a person in the circle. Memory Lane does not
perform facial recognition or automatically identify people; the user chooses
who a photo belongs to.

## The voice assistant

Memory Lane has a companion you can talk to. It runs on the AssemblyAI [Voice
Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api),
arranged so that the person's own memories are what it answers from, and so
that anything they ask it to keep lands in the memory library just as a photo
would.

> **Every capability, with example phrases: [VOICE-AGENT.md](VOICE-AGENT.md).**

The button in the bottom-right corner is on every screen. It opens a short
consent step first — what the microphone is for, and that they can stop at any
time — and only starts the session once that is allowed. Closing the panel
ends the call rather than leaving the microphone listening behind it.

### Turning it on

```bash
cp .env.example .env      # then set ASSEMBLYAI_API_KEY
npm run server            # alongside npm run dev, as usual
```

The key stays on the server. The page only ever receives a single-use,
60-second token from `POST /api/agent/token`, and the API key is never sent to
the browser.

### Two ways to run it

| | Inline (the default) | Stored agent |
| --- | --- | --- |
| How | the session carries the prompt and tools, and the browser runs them | an agent on your AssemblyAI account whose HTTP tools AssemblyAI calls |
| Needs | `ASSEMBLYAI_API_KEY` | that, plus a public `MEMORY_LANE_BASE_URL` |
| Good for | local use and browser testing | a deployed app, and the same companion by phone |

With no `AGENT_ID` set, the companion is configured inline for the session
(`GET /api/agent/config`) and its tools run in the browser against the app's
own API — so nothing needs to be reachable from the internet.

To publish it as a stored agent instead, point `MEMORY_LANE_BASE_URL` at an
address AssemblyAI can reach (a tunnel such as ngrok is fine while developing),
then:

```bash
MEMORY_LANE_BASE_URL=https://your-app.example.com npm run agent:publish
# put the id it prints into .env as AGENT_ID, then restart the API
```

### What it can do

The companion answers from the same store the screens read, and writes to it
too. Each tool is one small endpoint, so the behaviour lives in one place:

| It can | Tool | Endpoint |
| --- | --- | --- |
| say what day and time it is | `what_day_is_it` | `GET /api/agent/now` |
| look someone up, and show them on screen | `find_person` | `GET /api/agent/person` |
| say what is happening today | `get_day` | `GET /api/agent/context` |
| search the saved memories | `recall_memories` | `GET /api/agent/memories` |
| keep a note | `remember_this` | `POST /api/agent/remember` |
| correct a memory already saved — the year, its name, the note | `edit_memory` | `POST /api/agent/edit-memory` |
| add a reminder to today | `add_to_today` | `POST /api/agent/today` |
| take a plan off, today or any day coming up | `cancel_reminder` | `POST /api/agent/cancel` |
| change when a plan happens — today or any day coming up | `move_reminder` | `POST /api/agent/move` |
| say what a word means | `define_word` | `GET /api/agent/define` |
| search the web for a fact | `search_the_web` | `GET /api/agent/search` |
| move to a screen ("go to memories") | `go_to` | in the browser — there is no endpoint to call |

When it saves something, the screens that show it are refreshed as the tool
returns, so a note the person dictated is in their library before the call has
ended.

The last two reach outside the app, and both are answered by the API server, so
no key ever reaches the browser. Meanings come from Wiktionary and, with no
keys set, searches from Wikipedia — a fresh clone can answer "what is the
capital of Japan". Put `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CSE_ID` in
`.env` for real Google results (or `BRAVE_SEARCH_API_KEY` for Brave), and the
same endpoints keep working for a stored agent. What they ask about their own
life never comes from a search: those four tools answer from the app alone.

### The conversation moves the screen

Because the tools run in this browser, a spoken question can also change what
is on screen. Asking "who's my daughter?" opens Ellen's card — her face, her
photographs, how you know her — while the companion talks about her, so the
person is looking at the memory rather than only hearing it. Asking to go
somewhere does the same thing to the whole screen: "go to memories" lands on
Memories and the call carries on over it. A phone call has no screen and simply
never fires either.

The request travels through `src/data/agentFocus.ts`: the tool writes one,
`App` reads it and moves to the page that holds the cards (or, for `go_to`, to
the page that was named), and `WhoIsThis` opens the person and clears the
request. The session and the screens never have to know about each other.

### Nothing is ever thrown away

Taking something off a day is the one thing the companion does that changes a
plan rather than adding to it, so it is deliberately undoable and visible.
`cancel_reminder` never deletes an event: on today or any day coming up it
marks it hidden, leaves the plan where it was, and writes what the day used to
say into `schedule.changes`. The same log records every move, and every removal
made by hand in the Today screen, so the record is complete either way:

```json
{
  "by": "companion",
  "action": "cancelled",
  "at": "2026-09-27T19:41:02.114Z",
  "headline": "Ruby is coming for lunch",
  "before": { "time": "12:30", "headline": "Ruby is coming for lunch", "description": "…" },
  "after": null,
  "reason": "she said Ruby is away this week"
}
```

`GET /api/schedule/changes` returns it newest first, and nothing prunes it.
That is the surface a family member reads to see what was moved or taken off,
and why.

The prompt, greeting and voice live in `server/agent/persona.js`, and the tools
in `server/agent/tools.js`. Both are used by the inline session and by
`agent:publish`, so the two ways of running the companion cannot drift apart.

In the browser, `src/data/voiceAgent.ts` opens the session: it streams the
microphone as 24 kHz PCM16 over the Voice Agent API WebSocket, plays the reply
back through a ring buffer so interrupting stops it mid-word, and answers the
tools through `src/data/agentTools.ts`. Capture and playback each resample
inside an AudioWorklet, which is what lets Firefox and Safari keep their echo
cancellation.

Turn detection is left to the API rather than pinned to a silence timer. It
decides a turn has ended from the meaning of what was said, so an answer starts
as soon as the question is finished instead of after a fixed delay, while a
hesitant speaker still gets room — `server/agent/persona.js` keeps only
`interrupt_response`, and setting `min_silence`/`max_silence` there is what used
to add the wait.

Above the transcript the panel draws a wave from the very audio the call is
carrying: the microphone while it listens, a travelling pulse while the
companion is working on the answer, and the reply while it speaks. The wait
between a question and its answer is short now, but it is never silent and
never unexplained (`src/components/VoiceWave.tsx`).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the `/api` proxy |
| `npm run server` | the Express API |
| `npm run server:watch` | the API, restarting on file changes |
| `npm run agent:publish` | publish the companion as a stored AssemblyAI agent |
| `npm run build` | production build into `dist/` |
| `npm start` | build, then serve the app and the API together |
| `npm run preview` | preview the built frontend on its own |
