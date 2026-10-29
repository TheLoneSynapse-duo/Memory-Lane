/**
 * The Memory Lane voice assistant.
 *
 * Two kinds of route live here, and they are deliberately in one file because
 * they describe one thing — the companion.
 *
 *   Session  GET  /api/agent/config   how the browser should open the call
 *            POST /api/agent/token    a short-lived AssemblyAI token
 *
 *   Tools    GET  /api/agent/now      the day, the date and the time of day
 *            GET  /api/agent/context  today, what's coming, memory of the day
 *            GET  /api/agent/person   one familiar face, by name or relationship
 *            GET  /api/agent/memories search the saved memories
 *            GET  /api/agent/define   what a word means
 *            GET  /api/agent/search   the search engine, for the rest of the world
 *            POST /api/agent/remember keep a note
 *            POST /api/agent/edit-memory  correct a memory already saved
 *            POST /api/agent/today    add a reminder to today
 *            POST /api/agent/cancel   take a plan off, on any day, but keep it
 *            POST /api/agent/move     change when a plan happens, on any day
 *
 * Plans are matched against every day at once — today, the days ahead in the
 * schedule, and the "Coming up" list — because a person does not distinguish
 * between where the app happens to keep them. Cancelling never destroys
 * anything: the plan is only marked hidden, and the change is written to
 * `schedule.changes`, which a family member reads through
 * GET /api/schedule/changes (see routes/schedule.js).
 *
 * The tool routes are what the companion calls to answer a question or save
 * something. They are ordinary JSON endpoints: a client-side tool reaches them
 * from the browser on a local run, and an AssemblyAI HTTP tool reaches them
 * over the internet once the app is deployed. The API key never leaves this
 * process — the page only ever gets a single-use token.
 */
import { Router } from "express";
import { HttpError, asyncHandler, fullDate, shortDate, text } from "../http.js";
import {
  isoDay,
  matchPersonId,
  memoryOfTheDay,
  mergeTodayEvents,
  mutate,
  readDb,
  recordScheduleChange,
} from "../store.js";
import { greetingFor, keyterms, systemPromptFor, persona, turnDetection } from "../agent/persona.js";
import { clientTools } from "../agent/tools.js";

const router = Router();

const agentsApi = () => process.env.AGENTS_API_BASE || "https://agents.assemblyai.com/v1";
const isConfigured = () => Boolean(process.env.ASSEMBLYAI_API_KEY);
const storedAgentId = () => (process.env.AGENT_ID || "").trim();

const SETUP_HINT =
  "The voice assistant is not set up yet. Add ASSEMBLYAI_API_KEY to .env and restart the API.";

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/** GET /api/agent/config — the agent to speak as, and how to configure it. */
router.get("/config", (req, res) => {
  if (!isConfigured()) {
    res.json({
      enabled: false,
      mode: "inline",
      agentId: null,
      agentName: persona.name,
      session: null,
      reason: SETUP_HINT,
    });
    return;
  }

  // A published id means the companion is managed on the AssemblyAI account:
  // connect to it as it is and let its own tools answer. Otherwise the session
  // is configured inline, and the browser runs the tools.
  const agentId = storedAgentId();
  if (agentId) {
    res.json({
      enabled: true,
      mode: "stored",
      agentId,
      agentName: persona.name,
      session: null,
      reason: null,
    });
    return;
  }

  const db = readDb();
  const terms = keyterms(db);
  res.json({
    enabled: true,
    mode: "inline",
    agentId: null,
    agentName: persona.name,
    reason: null,
    session: {
      system_prompt: systemPromptFor(db),
      greeting: greetingFor(db),
      output: { voice: persona.voice },
      input: {
        ...(terms.length ? { keyterms: terms } : {}),
        turn_detection: turnDetection,
      },
      tools: clientTools(),
    },
  });
});

/** POST /api/agent/token — one single-use token, minted here so the key stays here. */
router.post(
  "/token",
  asyncHandler(async (req, res) => {
    if (!isConfigured()) throw new HttpError(503, SETUP_HINT);

    const url = new URL(`${agentsApi()}/token`);
    url.searchParams.set("expires_in_seconds", "60");

    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("[memory-lane] voice token request failed:", upstream.status, detail);
      throw new HttpError(502, "The voice assistant could not be reached. Please try again.");
    }

    const { token } = await upstream.json();
    res.json({ token });
  })
);

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/** A short, speech-shaped view of a saved memory. */
function memorySummary(memory) {
  return {
    about: memory.name || "a moment",
    note: memory.metNote || memory.caption,
    savedAt: shortDate(new Date(memory.createdAt)),
  };
}

/**
 * Everyone the person could reasonably mean. Deliberately an array: "my friend"
 * is two people in this family, and the honest answer is to let the companion
 * ask which rather than pick one.
 *
 * Relationships are matched too, so "my daughter" finds Ellen — that is how
 * people with dementia tend to ask, far more often than by name.
 */
/**
 * "Your granddaughter", "my daughter?", "the neighbour" → "granddaughter",
 * "daughter", "neighbour". Applied to both sides so the wording does not have
 * to line up: the store says "Your daughter" and people say "my daughter".
 */
function normalizeRelation(value) {
  return value
    .toLowerCase()
    .replace(/[?.!,]+$/, "")
    .replace(/^(your|my|the|our)\s+/, "")
    .trim();
}

function findPeople(people, wanted) {
  if (!wanted) return [];

  const name = (person) => person.name.toLowerCase();
  const relation = (person) => normalizeRelation(person.relationship);

  const exactName = people.filter((person) => name(person) === wanted);
  if (exactName.length) return exactName;

  const firstName = people.filter((person) => name(person).split(/\s+/)[0] === wanted);
  if (firstName.length) return firstName;

  const exactRelation = people.filter((person) => relation(person) === wanted);
  if (exactRelation.length) return exactRelation;

  // A word inside the relationship, so "the neighbour" and "my old friend" both
  // land. Tolerates a plural, which is how "my grandchildren" arrives.
  const singular = wanted.endsWith("s") ? wanted.slice(0, -1) : wanted;
  const byRelation = people.filter((person) => {
    const words = relation(person).split(/\s+/);
    return words.includes(wanted) || words.includes(singular) || relation(person).includes(singular);
  });
  if (byRelation.length) return byRelation;

  return people.filter(
    (person) => name(person).includes(wanted) || wanted.includes(name(person))
  );
}

/** Whether a saved memory is about the named person. */
function memoryMentions(memory, name) {
  const haystack = `${memory.name} ${memory.metNote} ${memory.caption}`.toLowerCase();
  return haystack.includes(name.toLowerCase());
}

/* -- the time, told the way it would be said out loud ---------------- */

const HOUR_WORDS = [
  "twelve",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
];

/** "just after nine", "quarter to five" — approximate, which is all that helps. */
function spokenTime(date) {
  const hour = date.getHours() % 12;
  const minute = date.getMinutes();
  const thisHour = HOUR_WORDS[hour];
  const nextHour = HOUR_WORDS[(hour + 1) % 12];
  if (minute === 0) return `exactly ${thisHour}`;
  if (minute <= 7) return `just after ${thisHour}`;
  if (minute <= 22) return `quarter past ${thisHour}`;
  if (minute <= 37) return `half past ${thisHour}`;
  if (minute <= 52) return `quarter to ${nextHour}`;
  return `nearly ${nextHour}`;
}

function partOfDay(date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function ordinal(value) {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  // 11, 12, 13 (and 111, 112, 113 …) are always "th" — the general rule
  // does not apply to them, so they must be caught before the mod-10 path.
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${suffixes[remainder % 10] ?? suffixes[0]}`;
}

/**
 * GET /api/agent/me — who they are, in their own words.
 *
 * The one question a companion must never get wrong: they ask their own name
 * and it answers "I don't know". The details come from the welcome step and
 * the personal-details dialog, so anything they have written is here too.
 */
router.get("/me", (req, res) => {
  const db = readDb();
  const { name, preferredName, about } = db.profile;

  if (!name) {
    res.json({
      known: false,
      hint: "They have not given their name yet. Ask warmly for it and offer to keep it with remember_this.",
    });
    return;
  }

  res.json({
    known: true,
    name,
    preferredName: preferredName || name.split(/\s+/)[0],
    about,
    message: `${name} is the person you are speaking with. They like to be called ${
      preferredName || name.split(/\s+/)[0]
    }.`,
  });
});

/**
 * POST /api/agent/me — keep the name they have just told you.
 *
 * What they say wins: a correction on a call reaches the same profile the
 * welcome step wrote, so the app and the companion never disagree about who
 * this is.
 */
router.post("/me", (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, { field: "name", max: 60 });
  const preferredName = text(body.preferredName, { field: "preferredName", max: 40 });

  if (!name && !preferredName) {
    res.json({ saved: false, error: "There was no name to keep yet. Ask them for it." });
    return;
  }

  const previous = readDb().profile;
  const profile = {
    // A nickname alone is not a name; keep what was already known.
    name: name || previous.name,
    preferredName: preferredName || (name ? "" : previous.preferredName),
    about: previous.about,
  };

  mutate((db) => {
    db.profile = profile;
  });

  const called = profile.preferredName || profile.name.split(/\s+/)[0];
  res.json({
    saved: true,
    name: profile.name,
    preferredName: called,
    message: `Thank you. I will call you ${called} from now on.`,
  });
});

/** GET /api/agent/now — what day it is, and the time of day. */
router.get("/now", (req, res) => {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const month = now.toLocaleDateString(undefined, { month: "long" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = partOfDay(now);

  res.json({
    weekday,
    partOfDay: when,
    date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    time,
    // Written to be spoken as it is, so the companion does not read "09:12".
    sentence: `It is ${weekday} ${when}, the ${ordinal(now.getDate())} of ${month}. It is ${spokenTime(now)}.`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

/** GET /api/agent/context — the day at a glance. */
router.get("/context", (req, res) => {
  const db = readDb();
  const plans = planCandidates(db);
  res.json({
    // Who they are, so a question about themselves never needs a second trip.
    aboutYou: {
      name: db.profile.name,
      preferredName:
        db.profile.preferredName ||
        (db.profile.name ? db.profile.name.split(/\s+/)[0] : ""),
      about: db.profile.about,
    },
    today: plans
      .filter((plan) => plan.day === "Today")
      .map(({ time, headline, description }) => ({
        time,
        headline,
        description,
      })),
    // Everything not today, with its day: the schedule's dated entries and the
    // "Coming up" list alike. Without these the companion could not see the
    // plans it is asked to change, and would have to guess at them.
    comingUp: plans
      .filter((plan) => plan.day !== "Today")
      .map(({ day, time, headline }) => ({ day, time, headline })),
    memoryOfTheDay: memoryOfTheDay(db.home.moments),
    people: db.people.map(({ name, relationship }) => ({ name, relationship })),
  });
});

/** The full card for one person, plus anything saved about them. */
function personCard(db, person) {
  return {
    found: true,
    // The app opens the person's own card with this, so a spoken question can
    // bring the right face on screen.
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    about: person.bio,
    lastMet: person.lastMet,
    loves: person.loves,
    somethingToSay: person.conversationStarter,
    savedAboutThem: db.memories
      .filter((memory) => memoryMentions(memory, person.name))
      .map(memorySummary),
  };
}

/** GET /api/agent/person?name=… — one familiar face, by name or relationship. */
router.get("/person", (req, res) => {
  const db = readDb();
  const wanted = normalizeRelation(String(req.query.name ?? ""));
  const matches = findPeople(db.people, wanted);

  if (matches.length === 1) {
    res.json(personCard(db, matches[0]));
    return;
  }

  if (matches.length > 1) {
    res.json({
      found: "several",
      matches: matches.map((person) => ({
        id: person.id,
        name: person.name,
        relationship: person.relationship,
      })),
      hint: "More than one person could be who they mean. Ask which of these they mean, gently.",
    });
    return;
  }

  res.json({
    found: false,
    known: db.people.map((person) => `${person.name} (${person.relationship})`),
    hint: "Nobody matched. Ask which of the known names they mean.",
  });
});

/**
 * Words that say nothing about what was kept — the glue of any question.
 * Matching on them would return everything, which is the same as finding
 * nothing at all.
 */
const NOISE_WORDS = new Set([
  "a", "an", "and", "any", "anything", "are", "about", "did", "do", "does", "for", "from",
  "had", "has", "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "our",
  "remember", "remembered", "recall", "some", "something", "tell", "the", "to", "was", "we",
  "what", "when", "where", "which", "who", "why", "with", "you", "your",
]);

/**
 * Spellings the transcriber produces interchangeably. A memory kept as
 * "the harbor" must still be found when it is asked for as "the harbour" —
 * the person does not care which way it was written down.
 */
const SPELLING_PAIRS = [
  ["harbour", "harbor"],
  ["colour", "color"],
  ["neighbour", "neighbor"],
  ["favourite", "favorite"],
  ["centre", "center"],
  ["theatre", "theater"],
  ["grey", "gray"],
];

/** The shape a word must be in to be found. Applied to both sides of a match. */
function searchStem(word) {
  let shaped = word;
  for (const [british, american] of SPELLING_PAIRS) {
    if (shaped === british) shaped = american;
  }
  if (shaped.endsWith("ies") && shaped.length > 4) return `${shaped.slice(0, -3)}y`;
  if (shaped.endsWith("es") && shaped.length > 4) return shaped.slice(0, -2);
  if (shaped.endsWith("s") && !shaped.endsWith("ss") && shaped.length > 3) return shaped.slice(0, -1);
  return shaped;
}

/**
 * The words of a question that are worth searching for: punctuation gone,
 * the glue words dropped, each remaining word in its stored shape. So
 * "Tell me the memory of the harbor, 2019" becomes [harbor, 2019].
 */
function searchWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !NOISE_WORDS.has(word))
    .map(searchStem);
}

/** How much of the question this piece of writing answers. */
function matchScore(words, ...parts) {
  if (!words.length) return 1; // No question: everything counts, most recent first.
  const written = new Set(searchWords(parts.join(" ")));
  return words.filter((word) => written.has(word)).length;
}

/** GET /api/agent/memories?about=… — search what has been kept. */
router.get("/memories", (req, res) => {
  const about = String(req.query.about ?? "").trim();
  const words = searchWords(about);
  const db = readDb();

  // Everything the app can hold: the photo library, the written moments on
  // Home, and the told-again stories. If it was entered anywhere in the app,
  // asking about it should find it.
  //
  // Asked word by word rather than as one exact phrase: a question is
  // phrased a dozen ways ("the harbor, 2019", "harbor 2019", "the harbor
  // from 2019"), and finding nothing when it is plainly on screen is worse
  // than finding a little. The closest answers come first.
  const best = (items, toText, limit) =>
    items
      .map((item) => ({ item, score: matchScore(words, ...toText(item)) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item);

  const matches = best(db.memories, (memory) => [memory.name, memory.metNote, memory.caption], 6);
  const moments = best(db.home.moments, (moment) => [moment.title, moment.text], 6);
  const stories = best(db.stories, (story) => [story.title, story.context, story.story], 4);

  res.json({
    about: about || null,
    found: matches.length + moments.length + stories.length,
    memories: matches.map(memorySummary),
    moments: moments.map((moment) => ({
      about: moment.title,
      note: moment.text,
    })),
    stories: stories.map((story) => ({
      about: story.title,
      note: story.story,
    })),
  });
});

/* -- the wider web: what a word means, and a search engine ----------- */

/**
 * Search providers, chosen by what is in .env and nothing else:
 *
 *   GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CSE_ID  real Google results
 *   BRAVE_SEARCH_API_KEY                          Brave Web Search
 *   neither                                       Wikipedia, which needs no key
 *
 * The keyless one is the default on purpose: the companion should be able to
 * answer "what is the capital of Japan" on a fresh clone, and a provider that
 * costs money to turn on is one that stays off.
 */
const GOOGLE_KEY = () => (process.env.GOOGLE_SEARCH_API_KEY || "").trim();
const GOOGLE_CX = () => (process.env.GOOGLE_SEARCH_CSE_ID || "").trim();
const BRAVE_KEY = () => (process.env.BRAVE_SEARCH_API_KEY || "").trim();

const SEARCH_TIMEOUT = 8_000;

/** One upstream call, timed out rather than left hanging the whole reply. */
async function searchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  });
  if (!response.ok) throw new Error(`upstream said ${response.status}`);
  return response.json();
}

/** The few HTML entities a search engine leaves in its own text. */
const ENTITIES = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  apos: "'",
  "#39": "'",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

/** The markup a search engine wraps around matched words, said out loud. */
function plain(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&([a-z#0-9]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

/** Where a result came from, as a person would name it: "the BBC", "Wikipedia". */
function sourceOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function searchGoogle(query) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", GOOGLE_KEY());
  url.searchParams.set("cx", GOOGLE_CX());
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  const data = await searchJson(url);
  return (data.items ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.snippet),
    source: sourceOf(item.link),
  }));
}

async function searchBrave(query) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  const data = await searchJson(url, {
    headers: { "X-Subscription-Token": BRAVE_KEY() },
  });
  return (data.web?.results ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.description),
    source: sourceOf(item.url),
  }));
}

async function searchWikipedia(query) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const data = await searchJson(url);
  return (data.query?.search ?? []).map((item) => ({
    title: plain(item.title),
    snippet: plain(item.snippet),
    source: "Wikipedia",
  }));
}

function searchProvider() {
  if (GOOGLE_KEY() && GOOGLE_CX()) return { name: "google", run: searchGoogle };
  if (BRAVE_KEY()) return { name: "brave", run: searchBrave };
  return { name: "wikipedia", run: searchWikipedia };
}

/**
 * GET /api/agent/search?query=… — the search engine, in one call.
 *
 * Returns summaries rather than links: the answer is spoken, so a URL is of no
 * use to anyone and a page of results is worse than three short ones. The
 * provider is deliberately not named to the model — it only needs to know
 * whether anything came back.
 */
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = text(req.query.query, { field: "query", max: 160 });
    if (!query) {
      res.json({
        found: 0,
        hint: '"query" is required — a few words about what they asked, e.g. capital of France.',
      });
      return;
    }

    const provider = searchProvider();
    let results = [];
    try {
      results = await provider.run(query);
    } catch (error) {
      // A search that fails is still an answer: say so rather than guessing.
      console.error("[memory-lane] web search failed:", error.message);
      res.json({
        found: 0,
        query,
        hint: "The search could not be reached. Tell them gently that you could not look it up — never guess.",
      });
      return;
    }

    res.json({
      found: results.length,
      query,
      results: results.slice(0, 5),
      hint: results.length
        ? "Answer from these in one or two short sentences of your own. Never read out links, lists or whole pages."
        : "Nothing came back. Say so gently and do not guess.",
    });
  })
);

/**
 * GET /api/agent/define?word=… — what a word means.
 *
 * Wiktionary rather than a search engine: a meaning wants the one plain
 * definition, not ten pages about it. Free, no key, and quick enough that the
 * companion does not leave a silence waiting on it. English only, which is the
 * language it speaks; a phrase with no entry is answered by search_the_web
 * instead.
 */
router.get(
  "/define",
  asyncHandler(async (req, res) => {
    const word = text(req.query.word, { field: "word", max: 80 });
    if (!word) {
      res.json({ found: false, hint: '"word" is required — the word they asked about.' });
      return;
    }

    let entries;
    try {
      // Lower case on the way in: Wiktionary titles are lower case, and a
      // capitalised word still lands through its redirect.
      const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
        word.toLowerCase()
      )}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT),
      });
      // No entry: the honest answer, and a reason to try the search instead.
      if (response.status === 404) {
        res.json({
          found: false,
          word,
          hint: "There is no dictionary entry for that. Try search_the_web, or say you are not sure — never invent a meaning.",
        });
        return;
      }
      if (!response.ok) throw new Error(`Wiktionary said ${response.status}`);
      entries = await response.json();
    } catch (error) {
      console.error("[memory-lane] word lookup failed:", error.message);
      res.json({
        found: false,
        word,
        hint: "The dictionary could not be reached. Say so gently rather than guessing a meaning.",
      });
      return;
    }

    // One definition per sense is all a voice can carry: the first meaning of
    // a word is the common one, and the rest only if they ask again. The HTML
    // in an entry is links and emphasis, so plain() leaves the words behind.
    const meanings = (Array.isArray(entries.en) ? entries.en : [])
      .flatMap((entry) =>
        (entry.definitions ?? []).map((definition) => ({
          partOfSpeech: plain(entry.partOfSpeech),
          definition: plain(definition.definition),
          example: plain(definition.examples?.[0]),
        }))
      )
      .filter(({ definition }) => definition)
      .slice(0, 4);

    if (!meanings.length) {
      res.json({
        found: false,
        word,
        hint: "Nothing usable came back. Try search_the_web, or say you are not sure.",
      });
      return;
    }

    res.json({
      found: true,
      word,
      meanings,
      hint: "Give the first meaning in your own slow words, and only add another if they ask.",
    });
  })
);

/** POST /api/agent/remember — keep a note in the memory library. */
router.post("/remember", (req, res) => {
  const body = req.body ?? {};
  const who = text(body.who, { field: "who", max: 40 });
  const note = text(body.note, { field: "note", max: 280 });

  if (!who && !note) {
    res.json({
      saved: false,
      error: "There was nothing to keep yet. Ask what they would like you to remember.",
    });
    return;
  }

  const card = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: who,
    metNote: note,
    caption: who ? `Remembered · ${who}` : `Remembered · ${shortDate()}`,
    createdAt: new Date().toISOString(),
    photoDataUrl: null,
    destinations: ["home"],
  };

  mutate((db) => {
    db.memories = [card, ...db.memories];
  });

  res.status(201).json({
    saved: true,
    about: who || note,
    kept: note,
    message: "Saved to the memory library, where it will be waiting next time.",
  });
});

/**
 * POST /api/agent/edit-memory — correct a memory that is already saved.
 *
 * "That was 2019, not 2021" is the commonest correction there is, and a
 * companion that answers "done" without any way to do it is worse than one
 * that admits it cannot help. So this finds the memory the way recall does —
 * the photo library and the written moments on Home, because both are "a
 * memory" to the person saying it — changes only what was asked for, and
 * answers with what it actually became.
 *
 * Nothing is guessed. A date that cannot be told, a memory that cannot be
 * singled out, or a change the record cannot hold comes straight back
 * unchanged with a hint about what to ask instead.
 */
router.post("/edit-memory", (req, res) => {
  const body = req.body ?? {};
  const about = text(body.about, { field: "about", max: 160 });
  const saidDate = text(body.date, { field: "date", max: 60 });
  const name = text(body.name, { field: "name", max: 40 });
  const note = text(body.note, { field: "note", max: 280 });

  if (!about) {
    res.json({
      changed: false,
      error: '"about" is required — a word or two of their own about which memory they mean.',
    });
    return;
  }
  if (!saidDate && !name && !note) {
    res.json({
      changed: false,
      error:
        "There is nothing to change yet. Ask what should be different — the year, what it is called, or the note.",
    });
    return;
  }

  const db = readDb();
  const wanted = searchWords(about);

  const candidates = [
    ...db.memories.map((memory) => ({
      kind: "memory",
      id: memory.id,
      text: [memory.name, memory.metNote, memory.caption],
      about: memory.name || memory.metNote,
      note: memory.metNote,
      when: memory.createdAt,
    })),
    ...db.home.moments.map((moment) => ({
      kind: "moment",
      id: moment.id,
      text: [moment.title, moment.text],
      about: moment.title,
      note: moment.text,
      when: "",
    })),
  ];

  const ranked = candidates
    .map((candidate) => ({ candidate, score: matchScore(wanted, ...candidate.text) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    res.json({
      changed: false,
      found: 0,
      hint: "Nothing matched what they said. Ask for a word or two from the memory itself — a name, a place, a year in it.",
    });
    return;
  }

  const top = ranked[0].score;
  const tied = ranked.filter(({ score }) => score === top);
  if (tied.length > 1) {
    res.json({
      changed: false,
      found: tied.length,
      candidates: tied.map(({ candidate }) => ({
        kind: candidate.kind,
        about: candidate.about,
        note: String(candidate.note ?? "").slice(0, 120),
        when: candidate.when ? fullDate(new Date(candidate.when)) : "",
      })),
      hint: "More than one memory could be that. Ask which of these they mean, gently.",
    });
    return;
  }

  const chosen = ranked[0].candidate;

  /* A saved photo: the date it carries is the date it was kept. */
  if (chosen.kind === "memory") {
    const previous = db.memories.find((memory) => memory.id === chosen.id);
    const createdAt = saidDate
      ? resolveMemoryDate(saidDate, previous.createdAt)
      : previous.createdAt;
    if (saidDate && !createdAt) {
      res.json({
        changed: false,
        error: `I could not tell which date "${saidDate}" is. Ask for the year, such as 2019.`,
      });
      return;
    }

    const before = {
      name: previous.name,
      note: previous.metNote,
      when: fullDate(new Date(previous.createdAt)),
    };
    const next = {
      ...previous,
      ...(name ? { name } : {}),
      ...(note ? { metNote: note } : {}),
      ...(saidDate ? { createdAt } : {}),
    };

    mutate((database) => {
      const index = database.memories.findIndex((memory) => memory.id === previous.id);
      if (index !== -1) database.memories[index] = next;
    });

    const said = [];
    if (name) said.push(`It is now called ${next.name}.`);
    if (note) said.push(`The note now reads: ${next.metNote}.`);
    if (saidDate) said.push(`The date is now ${fullDate(new Date(next.createdAt))}.`);

    res.json({
      changed: true,
      kind: "memory",
      about: next.name || next.metNote,
      before,
      after: {
        name: next.name,
        note: next.metNote,
        when: fullDate(new Date(next.createdAt)),
      },
      message: said.join(" "),
    });
    return;
  }

  /* A written moment: its year lives in its name — "The harbor, 2019". */
  const moment = db.home.moments.find((item) => item.id === chosen.id);
  let title = name || moment.title;

  if (saidDate) {
    const parsed = parseDatePhrase(saidDate);
    if (!parsed || parsed.year === null) {
      res.json({
        changed: false,
        error: "I could not tell which year that is. Ask for just the year, such as 2019.",
      });
      return;
    }
    if (parsed.precision !== "year") {
      res.json({
        changed: false,
        error: "The name of a written memory only holds a year. Ask for just the year, such as 2019.",
      });
      return;
    }
    if (!/\b\d{4}\b/.test(title)) {
      res.json({
        changed: false,
        error:
          "That memory's name has no year in it, so there is no year to change. Its name or its words can be changed instead — ask which.",
      });
      return;
    }
    title = title.replace(/\b\d{4}\b/, String(parsed.year));
  }

  const next = { ...moment, title, ...(note ? { text: note } : {}) };

  mutate((database) => {
    const index = database.home.moments.findIndex((item) => item.id === moment.id);
    if (index !== -1) database.home.moments[index] = next;
  });

  const said = [];
  if (name || saidDate) said.push(`It is now called ${next.title}.`);
  if (note) said.push(`The note now reads: ${next.text}.`);

  res.json({
    changed: true,
    kind: "moment",
    about: next.title,
    before: { name: moment.title, note: moment.text, when: "" },
    after: { name: next.title, note: next.text, when: "" },
    message: said.join(" "),
  });
});

/** Words that carry no meaning when matching what a person called something. */
const FILLER = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "your",
  "his",
  "her",
  "their",
  "its",
  "today",
  "tonight",
  "tomorrow",
  "this",
  "that",
  "of",
  "at",
  "on",
  "in",
  "for",
  "to",
  "is",
  "am",
  "are",
  "was",
  "please",
  "and",
  "with",
]);

/**
 * Which of the plans a phrase means. Matched on words, so "Ruby's lunch"
 * finds "Ruby is coming for lunch", and it returns every best-scoring plan so
 * an ambiguous phrase can be asked about rather than guessed at. The day is in
 * the match too, so "chess on Wednesday" finds Wednesday's chess.
 */
function matchEvents(events, wanted) {
  const tokens = wanted
    .toLowerCase()
    .split(/[^a-z0-9:]+/)
    .filter((token) => token && !FILLER.has(token));
  if (!tokens.length) return [];

  const scored = events
    .map((event) => {
      // The day is in the haystack too: "chess on Wednesday" should find
      // Wednesday's chess without them having to name it twice.
      const haystack = `${event.headline} ${event.description} ${event.day ?? ""}`.toLowerCase();
      return { event, score: tokens.filter((token) => haystack.includes(token)).length };
    })
    .filter((candidate) => candidate.score > 0);
  if (!scored.length) return [];

  const best = Math.max(...scored.map((candidate) => candidate.score));
  return scored.filter((candidate) => candidate.score === best).map((candidate) => candidate.event);
}

/* -- plans, on any day: today, the days ahead, and "Coming up" --------- */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

/** The glue a day is wrapped in: "on the 3rd of October", "next Friday". */
const DAY_FILLER = new Set([
  "on",
  "the",
  "of",
  "next",
  "this",
  "a",
  "an",
  "to",
  "in",
  "at",
  "for",
  "day",
  "date",
]);

/** A said phrase as bare lower-case words: "Next Friday" → ["next", "friday"]. */
function phraseWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
}

/** The weekday a word names, or -1: "thur" is Thursday, "sat" is Saturday. */
function weekdayOf(token) {
  if (token.length < 3) return -1;
  return WEEKDAYS.findIndex(
    (name) => token === name || token.startsWith(name) || name.startsWith(token)
  );
}

/** The day-words worth comparing: weekdays, today and tomorrow. */
function dayWords(value) {
  const known = new Set([...WEEKDAYS, "today", "tomorrow"]);
  return phraseWords(value).filter((word) => known.has(word));
}

/** "today", "tomorrow" — the days that take no preposition when spoken. */
function bareDay(day) {
  const value = String(day ?? "").trim();
  return /^(today|tomorrow)$/i.test(value) ? value.toLowerCase() : value;
}

/** "on Wednesday", but "today" and "tomorrow" take no preposition. */
function onDay(day) {
  const value = String(day ?? "").trim();
  return /^(today|tomorrow)$/i.test(value) ? value.toLowerCase() : `on ${value}`;
}

/** "Today", "Tomorrow", "Wednesday", "3 Oct" — the day a plan falls on. */
function dayLabel(iso) {
  if (!iso) return "Today";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  // The screen reads anything not ahead of us as today's, so the companion
  // must read it the same way — or the two would disagree about the same plan.
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return date.toLocaleDateString("en-GB", { weekday: "long" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * A date said out loud, as the parts that were actually said: "2019" is a
 * year, "March 2019" a month, "3 March 2019" a day. Null when it is not a
 * date at all — the caller must say so rather than guess one.
 */
function parseDatePhrase(value) {
  const phrase = String(value ?? "").trim();
  if (!phrase) return null;

  const iso = phrase.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]) - 1,
      day: Number(iso[3]),
      precision: "day",
    };
  }

  const tokens = phraseWords(phrase).filter((token) => !DAY_FILLER.has(token));
  if (!tokens.length) return null;
  if (tokens.length === 1 && /^\d{4}$/.test(tokens[0])) {
    return { year: Number(tokens[0]), month: null, day: null, precision: "year" };
  }

  let year = null;
  let month = null;
  let day = null;
  let known = 0;

  for (const token of tokens) {
    if (month === null && Object.hasOwn(MONTHS, token)) {
      month = MONTHS[token];
      known += 1;
      continue;
    }
    if (day === null && /^\d{1,2}(?:st|nd|rd|th)?$/.test(token)) {
      day = Number(token.replace(/\D+/g, ""));
      known += 1;
      continue;
    }
    if (year === null && /^\d{4}$/.test(token)) {
      year = Number(token);
      known += 1;
    }
  }

  if (!known) return null;
  return {
    year,
    month,
    day,
    precision: day !== null ? "day" : month !== null ? "month" : "year",
  };
}

/**
 * Which calendar day they meant: "tomorrow", "Friday", "the 5th of October".
 * Null when it cannot be told — the caller asks again rather than picking one.
 */
function resolvePlanDay(value) {
  const tokens = phraseWords(value).filter((token) => !DAY_FILLER.has(token));
  if (!tokens.length) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (tokens.includes("today")) return isoDay(now);
  if (tokens.includes("tomorrow")) {
    return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  }

  const wanted = tokens.find((token) => weekdayOf(token) >= 0);
  if (wanted) {
    let diff = (weekdayOf(wanted) - now.getDay() + 7) % 7;
    // "next Friday" said on a Friday means next week's, not today's.
    if (diff === 0 && tokens.includes("next")) diff = 7;
    return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff));
  }

  const parsed = parseDatePhrase(tokens.join(" "));
  if (!parsed || parsed.day === null || parsed.month === null) return null;
  const year = parsed.year ?? now.getFullYear();
  // "the 3rd of October" in September is this October; in November, next year's.
  const date = new Date(year, parsed.month, parsed.day);
  if (parsed.year === null && date < startOfToday) date.setFullYear(year + 1);
  return isoDay(date);
}

/**
 * The date a memory should carry after a correction. Only what they said
 * changes: "2019" keeps the month and day it already had, so a photo saved in
 * March stays in March. Null when no year was said — a month on its own is not
 * a date to put on someone's memory.
 */
function resolveMemoryDate(value, previousIso) {
  const parsed = parseDatePhrase(value);
  if (!parsed || parsed.year === null) return null;

  const previous = new Date(previousIso || Date.now());
  const at = Number.isNaN(previous.getTime()) ? new Date() : previous;
  const month = parsed.month ?? at.getMonth();
  const lastDay = new Date(parsed.year, month + 1, 0).getDate();
  const day = parsed.day ?? Math.min(at.getDate(), lastDay);
  return new Date(
    parsed.year,
    month,
    day,
    at.getHours(),
    at.getMinutes(),
    at.getSeconds(),
    at.getMilliseconds()
  ).toISOString();
}

/** Something that is a time rather than a day: "half seven", "3pm", "evening". */
function looksLikeTime(value) {
  return /\d|o'clock|half|quarter|morning|afternoon|evening|noon|midday|midnight|\b(?:am|pm)\b/i.test(
    String(value ?? "")
  );
}

/**
 * Every plan the companion may change, in one shape: today's schedule, the
 * days ahead in it, and the "Coming up" list. A question about "Wednesday"
 * has to be matched against all three, because the person asking does not
 * know — and should not have to know — where the app happens to keep them.
 */
function planCandidates(database = readDb()) {
  const today = isoDay();

  const scheduled = mergeTodayEvents(database).map((event) => {
    // Anything dated ahead belongs to that day; anything else — undated, or
    // written before dates existed — is part of today, as the screen reads it.
    const rawDate = typeof event.date === "string" ? event.date : "";
    const date = rawDate > today ? rawDate : "";
    return {
      kind: "schedule",
      id: event.id,
      date,
      rawDate,
      day: dayLabel(date),
      time: event.time || "Anytime",
      headline: event.headline,
      description: event.description || "",
      personId: event.personId || "",
    };
  });

  const comingUp = (database.upcomingEvents ?? [])
    .filter((event) => !event.hidden)
    .map((event) => ({
      kind: "upcoming",
      id: event.id,
      date: "",
      rawDate: "",
      // "Coming up" keeps a friendly word rather than a date, and that word
      // is the day the entry already carries.
      day: event.day || "Soon",
      time: "",
      headline: event.title,
      description: "",
      personId: event.personId || "",
    }));

  return [...scheduled, ...comingUp];
}

/**
 * The plans on the day they said; with no day said, every plan. A day that
 * cannot be told is an error rather than a guess — the caller asks again.
 */
function plansOnDay(plans, saidDay) {
  const phrase = String(saidDay ?? "").trim();
  if (!phrase) return { plans };

  const iso = resolvePlanDay(phrase);
  if (!iso) {
    return {
      error:
        "I could not tell which day that is. Ask them to say a weekday, tomorrow, or a date like 2026-10-05.",
    };
  }

  const label = dayLabel(iso).toLowerCase();
  const said = dayWords(phrase);
  const onThatDay = plans.filter((plan) => {
    if (plan.kind === "schedule") return (plan.date || isoDay()) === iso;
    // A "Coming up" entry carries a word, not a date: "Wednesday" against a
    // label of "Wednesday", "Next Friday" against "Friday", and either side
    // of "3 Oct" when it was written as a date.
    const planLabel = String(plan.day ?? "").toLowerCase();
    if (planLabel === label) return true;
    return dayWords(plan.day).some((word) => word === label || said.includes(word));
  });

  return { plans: onThatDay };
}

/** The plans worth reading back when nothing matched. */
const planList = (plans) => plans.map(({ day, time, headline }) => ({ day, time, headline }));

/** What a plan said, in the shape the change record keeps. */
const snapshot = (plan, over = {}) => ({
  day: over.day ?? plan.day,
  time: over.time ?? plan.time ?? "",
  headline: over.headline ?? plan.headline,
  description: over.description ?? plan.description ?? "",
});

/**
 * The answer when more than one plan could be meant — or when none could. It
 * always carries the plans themselves with their days, so the companion can
 * ask which rather than guess, and so a day with nothing on it says exactly
 * that instead of pretending nothing anywhere matched.
 */
function unmatchedPlans(flag, { matches, plans, all, day }) {
  const pool = matches.length ? matches : plans.length ? plans : all;
  return {
    [flag]: false,
    found: matches.length,
    day: day || null,
    plans: planList(pool),
    hint: matches.length
      ? "More than one plan could be that. Ask which they mean, saying its day."
      : plans.length
        ? "Nothing matched. These are the plans — ask which they mean."
        : "There is nothing on that day. These are all the plans there are — ask which day they meant.",
  };
}

/** POST /api/agent/cancel — take a plan off, on any day, keeping a record. */
router.post("/cancel", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });
  const reason = text(body.reason, { field: "reason", max: 200 });
  const saidDay = text(body.day, { field: "day", max: 60 });

  const all = planCandidates();
  const filtered = plansOnDay(all, saidDay);
  if (filtered.error) {
    res.json({ cancelled: false, error: filtered.error, plans: planList(all) });
    return;
  }

  const plans = filtered.plans;
  const matches = matchEvents(plans, what);
  if (matches.length !== 1) {
    res.json(unmatchedPlans("cancelled", { matches, plans, all, day: saidDay }));
    return;
  }

  const plan = matches[0];
  const before = snapshot(plan);

  mutate((database) => {
    // Hidden, never deleted: a scheduled plan has its id marked removed, a
    // "Coming up" entry is flagged, and either way the plan itself is left
    // where it was — so the day can be put back and family can see it.
    if (plan.kind === "schedule") {
      if (!database.schedule.removedIds.includes(plan.id)) {
        database.schedule.removedIds.push(plan.id);
      }
    } else {
      const entry = (database.upcomingEvents ?? []).find((item) => item.id === plan.id);
      if (entry) entry.hidden = true;
    }
    recordScheduleChange(database, {
      by: "companion",
      action: "cancelled",
      eventId: plan.id,
      headline: plan.headline,
      before,
      after: null,
      reason,
    });
  });

  res.json({
    cancelled: true,
    what: plan.headline,
    day: plan.day,
    ...(plan.time ? { time: plan.time } : {}),
    message: `${plan.headline} has been taken off ${onDay(plan.day)}. The record of it is kept.`,
  });
});

/** POST /api/agent/move — change when a plan happens, on any day. */
router.post("/move", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });
  const time = text(body.time, { field: "time", max: 40 });
  const saidDay = text(body.day, { field: "day", max: 60 });
  const headline = text(body.headline, { field: "headline", max: 120 });
  const details = text(body.details, { field: "details", max: 400 });
  const reason = text(body.reason, { field: "reason", max: 200 });

  const all = planCandidates();

  // Unlike cancel, the day here is where the plan is going, not where it is
  // now — so it picks the destination and never narrows the search. "Move
  // chess to Friday" must still find Wednesday's chess.
  const daySaid = saidDay || (!looksLikeTime(time) && resolvePlanDay(time) ? time : "");
  const timeSaid = daySaid && daySaid === time ? "" : time;

  if (!timeSaid && !daySaid && !headline && !details) {
    res.json({ moved: false, error: "There is nothing to change yet. Ask for the new time or day." });
    return;
  }

  const destination = daySaid ? resolvePlanDay(daySaid) : "";
  if (daySaid && !destination) {
    res.json({
      moved: false,
      error: "I could not tell which day that is. Ask for a weekday, tomorrow, or a date like 2026-10-05.",
      plans: planList(all),
    });
    return;
  }

  const matches = matchEvents(all, what);
  if (matches.length !== 1) {
    res.json(unmatchedPlans("moved", { matches, plans: all, all }));
    return;
  }

  const plan = matches[0];
  const wantedIso = destination || plan.rawDate;

  const before = snapshot(plan);

  /* A "Coming up" entry: a day and a line, and nothing else to hold. */
  if (plan.kind === "upcoming") {
    if (timeSaid || details) {
      res.json({
        moved: false,
        found: 1,
        plan: { day: plan.day, headline: plan.headline },
        error: `"${plan.headline}" is a plan for a day: a day and a line, with no time or description of its own. You can change the day or the wording — ask them which.`,
      });
      return;
    }

    const after = snapshot(plan, {
      day: wantedIso ? dayLabel(wantedIso) : plan.day,
      headline: headline || plan.headline,
      description: "",
    });

    if (after.day === before.day && after.headline === before.headline) {
      res.json({
        moved: false,
        found: 1,
        error: "Nothing was different from what the plan already said. Ask what should change.",
      });
      return;
    }

    mutate((database) => {
      const entry = (database.upcomingEvents ?? []).find((item) => item.id === plan.id);
      if (!entry) return;
      entry.day = after.day;
      entry.title = after.headline;
      recordScheduleChange(database, {
        by: "companion",
        action: "moved",
        eventId: entry.id,
        headline: after.headline,
        before,
        after,
        reason,
      });
    });

    const dayChanged = after.day !== before.day;
    res.json({
      moved: true,
      what: after.headline,
      day: after.day,
      from: { day: before.day, time: "" },
      to: { day: after.day, time: "" },
      message: dayChanged
        ? `${after.headline} has moved to ${bareDay(after.day)}.`
        : `${after.headline} has been changed.`,
    });
    return;
  }

  /* A scheduled plan: today's, or one dated ahead. */
  const after = snapshot(plan, {
    day: wantedIso ? dayLabel(wantedIso) : plan.day,
    time: timeSaid || plan.time,
    headline: headline || plan.headline,
    description: details || plan.description,
  });

  if (
    after.day === before.day &&
    after.time === before.time &&
    after.headline === before.headline &&
    after.description === before.description
  ) {
    res.json({
      moved: false,
      found: 1,
      error: "Nothing was different from what the plan already said. Ask what should change.",
    });
    return;
  }

  // Reworded to name someone new? The chip on the card follows the wording;
  // otherwise the plan keeps the face it already had.
  const personId = matchPersonId(readDb(), after.headline, after.description) || plan.personId || "";

  mutate((database) => {
    database.schedule.events[plan.id] = {
      id: plan.id,
      time: after.time,
      headline: after.headline,
      description: after.description,
      // The day only moves when they said a new one; otherwise the plan keeps
      // the date it was already on — including an undated one, which is today.
      date: wantedIso ?? plan.rawDate,
      personId,
    };
    recordScheduleChange(database, {
      by: "companion",
      action: "moved",
      eventId: plan.id,
      headline: after.headline,
      before,
      after,
      reason,
    });
  });

  const dayChanged = after.day !== before.day;
  const timeChanged = after.time !== before.time;
  const relative = /^(today|tomorrow)$/i.test(after.day);
  const message =
    dayChanged && timeChanged
      ? `${after.headline} has moved to ${after.time} ${relative ? after.day.toLowerCase() : `on ${after.day}`}.`
      : dayChanged
        ? `${after.headline} has moved to ${bareDay(after.day)}.`
        : timeChanged
          ? `${after.headline} is now at ${after.time}.`
          : `${after.headline} has been changed.`;

  res.json({
    moved: true,
    what: after.headline,
    day: after.day,
    from: { day: before.day, time: before.time },
    to: { day: after.day, time: after.time },
    message,
  });
});

/** POST /api/agent/today — add a reminder to today's plan. */
router.post("/today", (req, res) => {
  const body = req.body ?? {};
  const what = text(body.what, { field: "what", max: 120 });

  if (!what) {
    res.json({ added: false, error: '"what" is required — a short headline for the reminder.' });
    return;
  }

  const details = text(body.details, { field: "details", max: 400 });
  // Whoever the arrangement names — "a call with David at seven" — is who the
  // card's contact chip shows, the same way an event written by hand gets one.
  const personId = matchPersonId(readDb(), what, details);

  const event = {
    id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: text(body.time, { field: "time", max: 40 }) || "Anytime",
    headline: what,
    description: details,
    personId,
  };

  mutate((db) => {
    db.schedule.events[event.id] = event;
  });

  const person = readDb().people.find((face) => face.id === personId);
  res.status(201).json({
    added: true,
    time: event.time,
    what: event.headline,
    // Lets the companion say who it is with when it confirms the reminder.
    ...(person ? { with: person.name } : {}),
  });
});

export default router;
